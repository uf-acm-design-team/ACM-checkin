"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";

import { createServiceSupabaseClient } from "../utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Claims an orphaned guest attendees row (user_id IS NULL) by email, via the
 * service-role client.
 *
 * Guest check-in creates an attendee keyed only on a typed email
 * (checkin/guest-actions.ts). The equivalent claim used to run through the
 * RLS-gated browser client against the attendees_claim_by_email policy --
 * checks out on paper (Clerk is registered as a Supabase third-party auth
 * provider) but did not reliably link the row in practice, which is exactly
 * the "this email is already linked to another account" report: the row is
 * real and genuinely unclaimed, the RLS claim just silently failed to attach
 * it. Service role sidesteps whatever that gap is.
 *
 * Matched with ilike() to line up with the unique index on lower(email);
 * .eq() would miss "Ada@ufl.edu" vs "ada@ufl.edu".
 */
async function claimGuestAttendeeRow(
  supabase: SupabaseClient,
  userId: string,
  email: string,
): Promise<{ claimed: boolean; error?: string }> {
  if (!email) return { claimed: false };
  const { data, error } = await supabase
    .from("attendees")
    .update({ user_id: userId })
    .is("user_id", null)
    .ilike("email", email)
    .select("id");

  if (error) return { claimed: false, error: error.message };
  return { claimed: (data?.length ?? 0) > 0 };
}

/**
 * Marks the signed-in user as having completed onboarding.
 *
 * The flag lives in Clerk's publicMetadata (not a DB column) because proxy.ts
 * gates every request on it, and Clerk metadata rides along in the session
 * token -- so the check costs no database round-trip.
 *
 * publicMetadata is writable only from the server via clerkClient, which is
 * why this is a server action rather than a `user.update()` on the client.
 *
 * The attendee row is verified here rather than trusted from the caller: this
 * is the flag that unlocks the rest of the app, so it must reflect real state.
 *
 * Uses the service-role client rather than the RLS-gated one. Clerk is
 * registered as a Supabase third-party auth provider and the RLS policies
 * check out on paper, but the claim in syncOnboardingStatus below still
 * silently failed to link through that path in practice -- so this route
 * doesn't depend on it. The check is already authorized by Clerk's own
 * auth() above, so there's no security loss: userId comes from a verified
 * session, not from the caller.
 */
export async function completeOnboarding(): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "NOT_AUTHENTICATED" };

  // Confirm the attendees row actually exists before flipping the flag --
  // otherwise a failed insert would still let the user past the proxy, and
  // every downstream attendees lookup would return null.
  const supabase = createServiceSupabaseClient();
  const { data: attendee, error } = await supabase
    .from("attendees")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!attendee) return { ok: false, error: "NO_ATTENDEE_ROW" };

  const client = await clerkClient();
  await client.users.updateUser(userId, {
    publicMetadata: { onboardingComplete: true },
  });

  return { ok: true };
}

/**
 * Backfill for users who already have an attendees row but predate the
 * onboarding flag (signed up before /onboarding existed, or before the proxy
 * started enforcing it). Called from the onboarding page on mount so those
 * users are waved through instead of being asked to re-enter a profile the
 * database already has.
 *
 * Also claims an orphaned guest row by email, right here on mount -- before
 * this existed, claiming only happened client-side after the user filled out
 * and submitted the onboarding form (see page.tsx), which made someone with
 * attendance history re-type a profile the database already had. Moving it
 * here means it fires the moment the user lands on /onboarding instead.
 *
 * Uses the service-role client. The equivalent RLS-gated claim (in page.tsx,
 * and previously here too) checks out against attendees_claim_by_email on
 * paper -- Clerk is registered as a Supabase third-party auth provider -- but
 * did not reliably link the row in practice. Service role sidesteps whatever
 * that gap is; the email is read from Clerk's own backend record rather than
 * trusted from the client, so scoping stays equivalent to what RLS enforced.
 */
export async function syncOnboardingStatus(): Promise<{ alreadyOnboarded: boolean }> {
  // Never throws: this runs on mount and the page blocks rendering until it
  // settles, so a rejection here would leave the user staring at "Loading...".
  // Any failure degrades to "not onboarded", which shows the form -- recoverable.
  try {
    const { userId } = await auth();
    if (!userId) return { alreadyOnboarded: false };

    const supabase = createServiceSupabaseClient();
    const { data: attendee, error } = await supabase
      .from("attendees")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("syncOnboardingStatus: attendee lookup failed:", error);
      return { alreadyOnboarded: false };
    }

    const client = await clerkClient();
    let hasAttendee = Boolean(attendee);

    if (!hasAttendee) {
      const clerkUser = await client.users.getUser(userId);
      const email =
        clerkUser.emailAddresses.find(
          (e) => e.id === clerkUser.primaryEmailAddressId,
        )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

      if (email) {
        const claim = await claimGuestAttendeeRow(supabase, userId, email);
        if (claim.error) {
          console.error("syncOnboardingStatus: claim failed:", claim.error);
        } else if (claim.claimed) {
          hasAttendee = true;
        }
      }
    }

    if (!hasAttendee) return { alreadyOnboarded: false };

    await client.users.updateUser(userId, {
      publicMetadata: { onboardingComplete: true },
    });

    return { alreadyOnboarded: true };
  } catch (err) {
    console.error("syncOnboardingStatus failed:", err);
    return { alreadyOnboarded: false };
  }
}

export type SubmitOnboardingProfileResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Submits the onboarding form: claims an orphaned guest row by email, or
 * creates a fresh attendee if none exists, then flips the onboarding flag.
 *
 * Entirely service-role, including the claim -- this used to run from the
 * browser (page.tsx) against the RLS-gated client, the same claim that
 * syncOnboardingStatus above already had to move off of. Left there, it made
 * the failure deterministic: anyone whose claim silently failed fell through
 * to the INSERT, hit attendees_email_lower_key, retried the claim through the
 * exact same broken path, and landed on "already linked to another account"
 * for a row that was, in fact, theirs and genuinely unclaimed.
 */
export async function submitOnboardingProfile(input: {
  firstName: string;
  lastName: string;
  gradYear: string;
}): Promise<SubmitOnboardingProfileResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "NOT_AUTHENTICATED" };

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const gradYear = input.gradYear.trim();
  if (!firstName || !lastName || !gradYear) {
    return { ok: false, error: "Missing required fields." };
  }

  const supabase = createServiceSupabaseClient();

  const { data: existing } = await supabase
    .from("attendees")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  // Row already there (e.g. claimed via guest check-in, or by
  // syncOnboardingStatus on mount) -- nothing to claim or insert.
  if (!existing) {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    const email =
      clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? "";

    const claim = await claimGuestAttendeeRow(supabase, userId, email);
    if (claim.error) {
      return {
        ok: false,
        error: "Failed to link your existing check-ins: " + claim.error,
      };
    }

    if (!claim.claimed) {
      const { error: insertError } = await supabase.from("attendees").insert({
        user_id: userId,
        email,
        first_name: firstName,
        last_name: lastName,
        grad_year: gradYear,
      });

      if (insertError) {
        // 23505 on attendees_email_lower_key means a row with this email
        // exists that the claim above didn't catch -- e.g. a guest row
        // created in the instant between that claim and this insert. Retry
        // once rather than dead-ending on a raw DB error: if it matches now,
        // this request simply lost a race, not a real conflict.
        const isEmailConflict =
          insertError.code === "23505" &&
          insertError.message.includes("attendees_email_lower_key");

        const retry = isEmailConflict
          ? await claimGuestAttendeeRow(supabase, userId, email)
          : { claimed: false };

        if (!retry.claimed) {
          return {
            ok: false,
            error: isEmailConflict
              ? "This email is already linked to another account. Contact an officer if that's unexpected."
              : "Failed to save profile: " + insertError.message,
          };
        }
      }
    }

    await client.users.updateUser(userId, { firstName, lastName });
  }

  const completed = await completeOnboarding();
  return completed.ok
    ? { ok: true }
    : { ok: false, error: completed.error ?? "Failed to complete onboarding." };
}

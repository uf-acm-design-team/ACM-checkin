"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";

import { createServiceSupabaseClient } from "../utils/supabase/server";

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
        // Same claim guest-actions.ts and page.tsx use, and gated by the same
        // policy (attendees_claim_by_email): matched case-insensitively
        // against the unique index on lower(email), only an unclaimed
        // (user_id IS NULL) row is eligible, and WITH CHECK pins the new
        // user_id to the caller's own Clerk id.
        const { data: claimed, error: claimError } = await supabase
          .from("attendees")
          .update({ user_id: userId })
          .is("user_id", null)
          .ilike("email", email)
          .select("id")
          .maybeSingle();

        if (claimError) {
          console.error("syncOnboardingStatus: claim failed:", claimError);
        } else if (claimed) {
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

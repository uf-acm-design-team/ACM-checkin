"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";

import { createClerkSupabaseClient } from "../utils/supabase/server";

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
 */
export async function completeOnboarding(): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "NOT_AUTHENTICATED" };

  // Confirm the attendees row actually exists before flipping the flag --
  // otherwise a failed insert would still let the user past the proxy, and
  // every downstream attendees lookup would return null.
  const supabase = createClerkSupabaseClient();
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
 */
export async function syncOnboardingStatus(): Promise<{ alreadyOnboarded: boolean }> {
  // Never throws: this runs on mount and the page blocks rendering until it
  // settles, so a rejection here would leave the user staring at "Loading...".
  // Any failure degrades to "not onboarded", which shows the form -- recoverable.
  try {
    const { userId } = await auth();
    if (!userId) return { alreadyOnboarded: false };

    const supabase = createClerkSupabaseClient();
    const { data: attendee, error } = await supabase
      .from("attendees")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("syncOnboardingStatus: attendee lookup failed:", error);
      return { alreadyOnboarded: false };
    }
    if (!attendee) return { alreadyOnboarded: false };

    const client = await clerkClient();
    await client.users.updateUser(userId, {
      publicMetadata: { onboardingComplete: true },
    });

    return { alreadyOnboarded: true };
  } catch (err) {
    console.error("syncOnboardingStatus failed:", err);
    return { alreadyOnboarded: false };
  }
}

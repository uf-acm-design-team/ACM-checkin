/**
 * Onboarding form rules and submission.
 *
 * Validation matches web (app/onboarding/page.tsx) so a profile that web
 * accepts, mobile accepts too.
 */

import type { MobileSupabase } from './supabase/client';
import {
  callOnboardAttendee,
  OnboardingNetworkError,
  type OnboardAttendeeResult,
} from './supabase/onboard-attendee';

export const MAX_NAME_LENGTH = 50;

export type OnboardingInput = {
  firstName: string;
  lastName: string;
  gradYear: string;
};

/** Returns an error message for the first invalid field, or null when valid. */
export function validateOnboarding(input: OnboardingInput): string | null {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const gradYear = input.gradYear.trim();

  if (firstName.length === 0 || firstName.length > MAX_NAME_LENGTH) {
    return `First name must be between 1 and ${MAX_NAME_LENGTH} characters.`;
  }
  if (lastName.length === 0 || lastName.length > MAX_NAME_LENGTH) {
    return `Last name must be between 1 and ${MAX_NAME_LENGTH} characters.`;
  }
  if (!/^\d+$/.test(gradYear)) {
    return 'Grad year must be a number.';
  }
  return null;
}

export type SubmitResult = { ok: true } | { ok: false; error: string };

const SESSION_EXPIRED = 'Your session has expired. Please sign in again.';
const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";

/**
 * A readable message for each way onboard-attendee can fail. The function
 * sends no stable error `code`, so this branches on the HTTP status it uses
 * for each case (see supabase/functions/onboard-attendee/index.ts), never on
 * its `error` wording.
 */
export function onboardingErrorMessage({ status, reply }: OnboardAttendeeResult): string {
  if (!reply) {
    // Something other than the function answered, e.g. the gateway's 404
    // when onboard-attendee isn't being served.
    return `Onboarding isn't available right now (error ${status}). Please try again later.`;
  }
  switch (status) {
    case 401:
      return SESSION_EXPIRED;
    case 400:
      // Missing fields (already checked here) or a Clerk account with no email.
      return "We couldn't save these details. Make sure every field is filled in and your account has an email address.";
    case 409:
      return "This email is already linked to another account. Contact an officer if that's unexpected.";
    case 500:
      return 'Something went wrong on our end while saving your profile. Please try again in a moment.';
    default:
      return `Couldn't save your profile (error ${status}). Please try again.`;
  }
}

/**
 * Creates (or claims) the user's attendees row through the onboard-attendee
 * edge function. Mobile can't write the row itself: web does it server-side
 * with the service-role key, which must never ship in an app.
 *
 * The function identifies the user from the Clerk token -- never from the
 * body -- links any earlier guest check-ins by email, and syncs the name to
 * Clerk. `supabase` is null when nobody is signed in (see useSupabase).
 */
export async function submitOnboardingProfile(
  input: OnboardingInput,
  supabase: MobileSupabase | null,
): Promise<SubmitResult> {
  const invalid = validateOnboarding(input);
  if (invalid) return { ok: false, error: invalid };

  if (!supabase) return { ok: false, error: SESSION_EXPIRED };

  let result: OnboardAttendeeResult;
  try {
    result = await callOnboardAttendee(supabase, {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      gradYear: input.gradYear.trim(),
    });
  } catch (error) {
    if (error instanceof OnboardingNetworkError) return { ok: false, error: NETWORK_ERROR };
    throw error;
  }

  if (result.reply?.ok) return { ok: true };
  return { ok: false, error: onboardingErrorMessage(result) };
}

// Request/response contract for the onboard-attendee edge function.
//
// Types only, so the web app and mobile can import them without pulling in
// any Deno code. docs/API.md describes the same contract in prose.

// Request
/**
 * POST body, as application/json or multipart/form-data. Identity and email
 * come from the Clerk JWT and Clerk's own record, never from the body.
 *
 * Two modes, picked by whether any profile field is sent:
 * - Profile: all three fields. Links a guest row or creates a new one.
 * - Link-only: none of them (an empty body is fine). Links an existing or
 *   guest row if there is one, and otherwise answers `needsProfile: true`
 *   without writing anything. Web calls this when /onboarding loads, so a
 *   guest with check-in history skips the form.
 *
 * Sending some but not all of the profile fields is a 400.
 */
export type OnboardAttendeeRequest =
  | { firstName: string; lastName: string; gradYear: string }
  | Record<string, never>;

// Responses
export type OnboardedAttendee = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  grad_year: string;
};

/** 200. The caller now has an attendees row. */
export type OnboardAttendeeLinked = {
  ok: true;
  /** Same as `ok`. Kept for older callers. */
  success: true;
  needsProfile: false;
  /** The row already belonged to this user before the call. */
  alreadyOnboarded: boolean;
  /** A guest row (user_id NULL, same email) was linked by this call. */
  claimed: boolean;
  attendee: OnboardedAttendee;
};

/** 200, link-only mode only. Nothing to link, so the user must fill in the form. */
export type OnboardAttendeeNeedsProfile = {
  ok: true;
  success: true;
  needsProfile: true;
  alreadyOnboarded: false;
  claimed: false;
  attendee: null;
};

export type OnboardAttendeeSuccess = OnboardAttendeeLinked | OnboardAttendeeNeedsProfile;

// Failures. Branch on `code`, never on `error`.
type Failure<Code extends string> = {
  ok: false;
  // Stable, machine-readable.
  code: Code;
  // Human-readable, safe to show the user. Wording may change.
  error: string;
};

export type OnboardAttendeeError =
  | Failure<"invalid_request"> // 400: body unreadable, or some profile fields missing/blank
  | Failure<"no_email"> // 400: the Clerk account has no email to link or save
  | Failure<"unauthenticated"> // 401: no token, or an invalid one
  | Failure<"method_not_allowed"> // 405
  | Failure<"email_taken"> // 409: another account owns this email
  | Failure<"server_error">; // 500: config, Clerk, or database failure

export type OnboardAttendeeErrorCode = OnboardAttendeeError["code"];

export type OnboardAttendeeResponse = OnboardAttendeeSuccess | OnboardAttendeeError;

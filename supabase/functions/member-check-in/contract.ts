// Request/response contract for the member-check-in edge function (ADTCIA-38).
//
// Types only. Answer and geofence types come straight from lib/ so form-schema
// and geo stay the single source of truth; `supabase functions serve` mounts
// the lib files this imports. The function imports this file as
// "./contract.ts" (Deno); the mobile app imports it type-only through
// mobile/src/lib/member-check-in.ts, which `import type` erases at build time,
// so Metro never has to resolve a file outside mobile/.

import type { AnswerMap, AnswerValue } from "../../../lib/form-schema.ts";
import type { GeofenceFailure } from "../../../lib/geo.ts";

export type { AnswerMap, AnswerValue, GeofenceFailure };

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/**
 * POST body. Identity comes from the Clerk JWT only: the body never carries a
 * user_id or attendee_id, and the function rejects one if it is sent.
 *
 * Optional fields may be omitted or sent as null; both mean "not provided".
 */
export type MemberCheckInRequest = {
  orgSlug: string;
  /** Which open meeting to check into, when several are open at once. */
  meetingId?: string;
  /** Only needed when the meeting has a check-in password. */
  password?: string;
  /**
   * Keyed by question id, checked against the meeting's form by
   * lib/form-schema.ts. May be omitted when the form has no questions.
   */
  answers?: AnswerMap;
  /** The device's GPS fix, sent together. Required when the meeting is geo-locked. */
  latitude?: number;
  longitude?: number;
};

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/** 200. `alreadyCheckedIn: true` means no new row was written; still a success. */
export type MemberCheckInSuccess = {
  ok: true;
  /** The meeting the attendance was recorded against. */
  meetingId: string;
  alreadyCheckedIn: boolean;
};

type Failure<Code extends string, Extra = unknown> = {
  ok: false;
  /** Stable, machine-readable. Branch on this, never on `error`. */
  code: Code;
  /** Human-readable, safe to show the user. Wording may change. */
  error: string;
} & Extra;

export type MemberCheckInError =
  | Failure<"invalid_request", { fieldErrors: Record<string, string> }> // 400
  | Failure<"unauthenticated"> //                                        401
  | Failure<"no_profile"> //                                             403
  | Failure<"wrong_password"> //                                         403
  | Failure<"outside_geofence", { geo: GeofenceFailure }> //             403
  | Failure<"org_not_found"> //                                          404
  | Failure<"method_not_allowed"> //                                     405
  | Failure<"no_active_meeting"> //                                      409
  | Failure<"meeting_closed"> //                                         409
  | Failure<"invalid_answers", { answerErrors: Record<string, string> }> // 422
  | Failure<"server_error"> //                                           500
  | Failure<"not_implemented">; //                                       501

export type MemberCheckInErrorCode = MemberCheckInError["code"];

export type MemberCheckInResponse = MemberCheckInSuccess | MemberCheckInError;

/**
 * Decides what the check-in page shows for a member-check-in response.
 *
 * Pure, so every code can be tested without a browser
 * (member-check-in-outcome.test.ts). The page only applies the outcome: it
 * never reads `code` or `error` itself.
 *
 * Before this existed the page matched on error text (`/password/i`), which
 * also counted "Could not verify the meeting password." -- a server failure --
 * as a wrong-password attempt.
 */

import type { MemberCheckInResponse } from "../supabase/functions/member-check-in/contract";
import type { EdgeFunctionFailure } from "./edge-functions";

/** Everything callEdgeFunction can return for member-check-in. */
export type MemberCheckInResult = MemberCheckInResponse | EdgeFunctionFailure;

export type CheckInOutcome =
  /** "You're checked in". `membership` is only sent for orgs with a threshold. */
  | { kind: "success"; membership?: { attended: number; threshold: number } }
  /** "Already checked in". Nothing new was written. */
  | { kind: "already" }
  /** Full-screen "We couldn't reach the server" with Retry. */
  | { kind: "network_error"; detail: string }
  /** Full-screen "Move about N m closer". */
  | { kind: "too_far"; metresAway: number; radius: number }
  /** Error under the password field; counts as a failed attempt. */
  | { kind: "password_error"; message: string }
  /** Inline error plus a message under each question that failed. */
  | { kind: "answer_errors"; message: string; answerErrors: Record<string, string> }
  /** Inline error under the form. */
  | { kind: "inline_error"; message: string };

export function checkInOutcome(result: MemberCheckInResult): CheckInOutcome {
  if (result.ok) {
    return result.alreadyCheckedIn
      ? { kind: "already" }
      : { kind: "success", membership: result.membership };
  }

  // Pick the screen for the frontend. The wording always comes from result.error.
  switch (result.code) {
    case "wrong_password": return {
      kind: "password_error",
      message: result.error
    }
    case "outside_geofence": {
      if (result.geo.kind === "too_far") {
        return { kind: "too_far", metresAway: result.geo.metresAway, radius: result.geo.radius }
      } else {
        return { kind: "inline_error", message: result.error }
      }
    }
    case "invalid_answers": return {
      kind: "answer_errors",
      message: result.error,
      answerErrors: result.answerErrors
    }
    case "network_error": return {
      kind: "network_error",
      detail: `POST member-check-in - ${result.error}`
    }
    case "server_error":
    case "no_profile":
    case "meeting_closed":
    case "no_active_meeting":
    case "org_not_found":
    case "unauthenticated":
    case "invalid_request":
    case "method_not_allowed":
      return { kind: "inline_error", message: result.error };
  }
}

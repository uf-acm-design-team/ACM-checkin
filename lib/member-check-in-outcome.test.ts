import { describe, expect, it } from "vitest";

import { checkInOutcome, type MemberCheckInResult } from "./member-check-in-outcome";

// The failure cases below pin what the page showed on the old server action
// (baseline recorded before the switch), so the switch can't change them.

describe("checkInOutcome: successes", () => {
  it("shows success with the membership count", () => {
    const result: MemberCheckInResult = {
      ok: true,
      meetingId: "m1",
      alreadyCheckedIn: false,
      membership: { attended: 1, threshold: 3 },
    };
    expect(checkInOutcome(result)).toEqual({ kind: "success", membership: { attended: 1, threshold: 3 } });
  });

  it("shows success without a count for orgs with no threshold", () => {
    expect(checkInOutcome({ ok: true, meetingId: "m1", alreadyCheckedIn: false })).toEqual({
      kind: "success",
      membership: undefined,
    });
  });

  it("shows already-checked-in", () => {
    expect(checkInOutcome({ ok: true, meetingId: "m1", alreadyCheckedIn: true })).toEqual({ kind: "already" });
  });
});

describe("checkInOutcome: failures the baseline recorded", () => {
  it("puts a wrong password under the password field", () => {
    expect(
      checkInOutcome({ ok: false, code: "wrong_password", error: "Incorrect meeting password." }),
    ).toEqual({ kind: "password_error", message: "Incorrect meeting password." });
  });

  it("shows the too-far screen when the server's geofence rejects", () => {
    expect(
      checkInOutcome({
        ok: false,
        code: "outside_geofence",
        error: "You're 1624 m outside the check-in area.",
        geo: { kind: "too_far", metresAway: 1624, radius: 200 },
      }),
    ).toEqual({ kind: "too_far", metresAway: 1624, radius: 200 });
  });

  it("shows an inline error when the server needed a location the page didn't send", () => {
    expect(
      checkInOutcome({
        ok: false,
        code: "outside_geofence",
        error: "This meeting needs your location to check in.",
        geo: { kind: "location_required" },
      }),
    ).toEqual({ kind: "inline_error", message: "This meeting needs your location to check in." });
  });

  it("marks the questions that failed", () => {
    expect(
      checkInOutcome({
        ok: false,
        code: "invalid_answers",
        error: "Answer the required questions before checking in.",
        answerErrors: { q1: "Select an option." },
      }),
    ).toEqual({
      kind: "answer_errors",
      message: "Answer the required questions before checking in.",
      answerErrors: { q1: "Select an option." },
    });
  });

  it("shows the full-screen network error when the function never answered", () => {
    const outcome = checkInOutcome({
      ok: false,
      code: "network_error",
      error: "Couldn't reach the server. Check your connection and try again.",
    });
    expect(outcome.kind).toBe("network_error");
  });
});

describe("checkInOutcome: failures that aren't a password problem", () => {
  it("doesn't count a server failure during the password check as a wrong password", () => {
    const outcome = checkInOutcome({
      ok: false,
      code: "server_error",
      error: "Could not verify the meeting password.",
    });
    expect(outcome.kind).not.toBe("password_error");
    expect(outcome.kind).not.toBe("network_error");
  });
});

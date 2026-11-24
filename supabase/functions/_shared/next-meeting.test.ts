import { describe, expect, it } from "vitest";

import { hasEnded, nextMeeting, upcomingMeetings } from "./next-meeting";

const now = Date.parse("2026-11-18T20:00:00Z");
const meeting = (id: string, start: string, end: string | null, status = true) => ({
  id,
  start_time: start,
  end_time: end,
  status,
});

describe("hasEnded", () => {
  it("counts a running meeting as not ended", () => {
    expect(hasEnded(meeting("m", "2026-11-18T19:00:00Z", "2026-11-18T21:00:00Z"), now)).toBe(false);
  });

  it("uses the start time when there is no end time", () => {
    expect(hasEnded(meeting("m", "2026-11-18T19:00:00Z", null), now)).toBe(true);
    expect(hasEnded(meeting("m", "2026-11-18T21:00:00Z", null), now)).toBe(false);
  });
});

describe("upcomingMeetings", () => {
  it("drops ended meetings and sorts the rest soonest first", () => {
    const list = [
      meeting("later", "2026-11-25T23:00:00Z", "2026-11-26T00:00:00Z"),
      meeting("past", "2026-11-11T23:00:00Z", "2026-11-12T00:00:00Z"),
      meeting("running", "2026-11-18T19:00:00Z", "2026-11-18T21:00:00Z"),
    ];
    expect(upcomingMeetings(list, now).map((m) => m.id)).toEqual(["running", "later"]);
  });
});

describe("nextMeeting", () => {
  it("skips a closed meeting for a later open one", () => {
    const list = [
      meeting("closed", "2026-11-19T23:00:00Z", "2026-11-20T00:00:00Z", false),
      meeting("open", "2026-11-25T23:00:00Z", "2026-11-26T00:00:00Z", true),
    ];
    expect(nextMeeting(list, now)?.id).toBe("open");
  });

  it("falls back to the first upcoming meeting when all are closed", () => {
    const list = [
      meeting("b", "2026-11-25T23:00:00Z", "2026-11-26T00:00:00Z", false),
      meeting("a", "2026-11-19T23:00:00Z", "2026-11-20T00:00:00Z", false),
    ];
    expect(nextMeeting(list, now)?.id).toBe("a");
  });

  it("is undefined when nothing is upcoming", () => {
    expect(nextMeeting([meeting("past", "2026-11-11T23:00:00Z", "2026-11-12T00:00:00Z")], now)).toBeUndefined();
  });
});

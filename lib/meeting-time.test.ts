import { describe, it, expect } from "vitest";
import {
  toDateTimeLocal,
  fromDateTimeLocal,
  orgWallClock,
  isBefore,
  isWithinMeetingWindow,
} from "./meeting-time";

// meetings.start_time / end_time are timestamptz. PostgREST returns them with
// an explicit offset; the org's wall clock is America/New_York.

describe("toDateTimeLocal (DB instant -> datetime-local input)", () => {
  it("renders a summer (EDT, UTC-4) instant in Eastern", () => {
    // 19:00 UTC == 3:00 PM EDT. The old .slice(0,16) produced "19:00".
    expect(toDateTimeLocal("2026-09-03T19:00:00+00:00")).toBe("2026-09-03T15:00");
  });

  it("renders a winter (EST, UTC-5) instant in Eastern", () => {
    expect(toDateTimeLocal("2026-01-15T20:00:00+00:00")).toBe("2026-01-15T15:00");
  });

  it("rolls the date back when UTC has already ticked over midnight", () => {
    // 02:00 UTC on Sep 4 is still 10:00 PM on Sep 3 in Eastern.
    expect(toDateTimeLocal("2026-09-04T02:00:00+00:00")).toBe("2026-09-03T22:00");
  });

  it("handles a non-UTC offset in the incoming string", () => {
    expect(toDateTimeLocal("2026-09-03T15:00:00-04:00")).toBe("2026-09-03T15:00");
  });

  it("returns empty for null, undefined and unparseable input", () => {
    expect(toDateTimeLocal(null)).toBe("");
    expect(toDateTimeLocal(undefined)).toBe("");
    expect(toDateTimeLocal("not a date")).toBe("");
  });
});

describe("fromDateTimeLocal (datetime-local input -> DB instant)", () => {
  it("treats the typed time as Eastern in summer", () => {
    expect(fromDateTimeLocal("2026-09-03T15:00")).toBe("2026-09-03T19:00:00.000Z");
  });

  it("treats the typed time as Eastern in winter", () => {
    expect(fromDateTimeLocal("2026-01-15T15:00")).toBe("2026-01-15T20:00:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(fromDateTimeLocal("")).toBeNull();
    expect(fromDateTimeLocal("2026-09-03")).toBeNull();
  });
});

describe("round trip", () => {
  it("survives a full cycle at many times of day", () => {
    for (const local of [
      "2026-09-03T00:00",
      "2026-09-03T09:30",
      "2026-09-03T15:00",
      "2026-09-03T23:59",
      "2026-01-15T18:45",
      "2026-06-30T12:00",
    ]) {
      const iso = fromDateTimeLocal(local)!;
      expect(toDateTimeLocal(iso)).toBe(local);
    }
  });

  it("survives the DST transitions", () => {
    // These are where a single-pass offset correction lands on the wrong side.
    // Spring forward 2026-03-08, fall back 2026-11-01 (both 2:00 AM local).
    for (const local of [
      "2026-03-07T23:30", // night before spring forward
      "2026-03-08T04:00", // after spring forward
      "2026-10-31T23:30", // night before fall back
      "2026-11-01T04:00", // after fall back
    ]) {
      const iso = fromDateTimeLocal(local)!;
      expect(toDateTimeLocal(iso)).toBe(local);
    }
  });
});

describe("orgWallClock", () => {
  it("extracts Eastern parts, not UTC parts", () => {
    expect(orgWallClock("2026-09-04T02:00:00+00:00")).toEqual({
      year: 2026, month: 9, day: 3, hour: 22, minute: 0,
    });
  });

  it("returns null for garbage", () => {
    expect(orgWallClock("nope")).toBeNull();
  });
});

describe("isBefore", () => {
  it("compares instants regardless of the offsets used to write them", () => {
    // Same instant, different notations.
    expect(isBefore("2026-09-03T19:00:00+00:00", "2026-09-03T15:00:00-04:00")).toBe(false);
    expect(isBefore("2026-09-03T18:00:00+00:00", "2026-09-03T15:00:00-04:00")).toBe(true);
  });
});

describe("isWithinMeetingWindow", () => {
  const start = "2026-09-03T15:00:00-04:00";
  const end = "2026-09-03T16:00:00-04:00";

  it("is true strictly between start and end", () => {
    expect(isWithinMeetingWindow(new Date("2026-09-03T15:30:00-04:00"), start, end)).toBe(true);
  });

  it("is true exactly at the start and end boundaries", () => {
    expect(isWithinMeetingWindow(new Date(start), start, end)).toBe(true);
    expect(isWithinMeetingWindow(new Date(end), start, end)).toBe(true);
  });

  it("is false before start", () => {
    expect(isWithinMeetingWindow(new Date("2026-09-03T14:59:00-04:00"), start, end)).toBe(false);
  });

  it("is false after end", () => {
    expect(isWithinMeetingWindow(new Date("2026-09-03T16:01:00-04:00"), start, end)).toBe(false);
  });

  it("treats a null start as unbounded below", () => {
    expect(isWithinMeetingWindow(new Date("2020-01-01T00:00:00Z"), null, end)).toBe(true);
  });

  it("treats a null end as unbounded above", () => {
    expect(isWithinMeetingWindow(new Date("2099-01-01T00:00:00Z"), start, null)).toBe(true);
  });

  it("is always true when both bounds are null", () => {
    expect(isWithinMeetingWindow(new Date(), null, null)).toBe(true);
  });
});

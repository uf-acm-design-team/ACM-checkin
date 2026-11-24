import { describe, it, expect } from "vitest";
import {
  parseAnalyticsRange,
  rangeToSearchParams,
  type AnalyticsRange,
} from "./analytics-range";

// Noon EDT on 2026-10-21.
const NOW = new Date("2026-10-21T16:00:00Z");

const DEFAULT_30D: AnalyticsRange = {
  preset: "30d",
  from: "2026-09-22",
  to: "2026-10-21",
  start: "2026-09-22T04:00:00.000Z",
  end: "2026-10-22T03:59:59.999Z",
};

describe("presets", () => {
  it("defaults to the last 30 days when range is missing", () => {
    expect(parseAnalyticsRange({}, NOW)).toEqual({ ok: true, range: DEFAULT_30D });
  });

  it("treats null and empty range as missing", () => {
    expect(parseAnalyticsRange({ range: null }, NOW)).toEqual({ ok: true, range: DEFAULT_30D });
    expect(parseAnalyticsRange({ range: "" }, NOW)).toEqual({ ok: true, range: DEFAULT_30D });
  });

  it("parses 30d as 30 calendar days ending today", () => {
    expect(parseAnalyticsRange({ range: "30d" }, NOW)).toEqual({ ok: true, range: DEFAULT_30D });
  });

  it("parses 90d as 90 calendar days ending today", () => {
    expect(parseAnalyticsRange({ range: "90d" }, NOW)).toEqual({
      ok: true,
      range: {
        preset: "90d",
        from: "2026-07-24",
        to: "2026-10-21",
        start: "2026-07-24T04:00:00.000Z",
        end: "2026-10-22T03:59:59.999Z",
      },
    });
  });

  it("ignores stray from/to on a preset", () => {
    expect(
      parseAnalyticsRange({ range: "30d", from: "2020-01-01", to: "2020-01-31" }, NOW),
    ).toEqual({ ok: true, range: DEFAULT_30D });
  });

  it("takes today from Eastern, not UTC", () => {
    // 02:30 UTC on Oct 22 is still 10:30 PM on Oct 21 in Eastern.
    const lateEvening = new Date("2026-10-22T02:30:00Z");
    expect(parseAnalyticsRange({ range: "30d" }, lateEvening)).toEqual({
      ok: true,
      range: DEFAULT_30D,
    });
  });

  it("uses each bound's own offset when 30d crosses fall back", () => {
    // Noon EST on 2026-11-15: start is in EDT, end is in EST.
    const afterFallBack = new Date("2026-11-15T17:00:00Z");
    expect(parseAnalyticsRange({ range: "30d" }, afterFallBack)).toEqual({
      ok: true,
      range: {
        preset: "30d",
        from: "2026-10-17",
        to: "2026-11-15",
        start: "2026-10-17T04:00:00.000Z",
        end: "2026-11-16T04:59:59.999Z",
      },
    });
  });
});

describe("custom", () => {
  const custom = (from: string, to: string) =>
    parseAnalyticsRange({ range: "custom", from, to }, NOW);

  it("parses a valid custom range", () => {
    expect(custom("2026-09-01", "2026-10-15")).toEqual({
      ok: true,
      range: {
        preset: "custom",
        from: "2026-09-01",
        to: "2026-10-15",
        start: "2026-09-01T04:00:00.000Z",
        end: "2026-10-16T03:59:59.999Z",
      },
    });
  });

  it("accepts a single day", () => {
    expect(custom("2026-10-21", "2026-10-21")).toMatchObject({
      ok: true,
      range: { start: "2026-10-21T04:00:00.000Z", end: "2026-10-22T03:59:59.999Z" },
    });
  });

  it("handles the spring-forward day (23 hours long)", () => {
    expect(custom("2026-03-08", "2026-03-08")).toMatchObject({
      ok: true,
      range: { start: "2026-03-08T05:00:00.000Z", end: "2026-03-09T03:59:59.999Z" },
    });
  });

  it("handles the fall-back day (25 hours long)", () => {
    expect(custom("2026-11-01", "2026-11-01")).toMatchObject({
      ok: true,
      range: { start: "2026-11-01T04:00:00.000Z", end: "2026-11-02T04:59:59.999Z" },
    });
  });

  it("accepts a leap day", () => {
    expect(custom("2028-02-29", "2028-02-29")).toMatchObject({ ok: true });
  });

  it("allows future dates", () => {
    expect(custom("2026-12-01", "2026-12-31")).toMatchObject({ ok: true });
  });

  it("accepts exactly 366 days", () => {
    expect(custom("2026-01-01", "2027-01-01")).toMatchObject({ ok: true });
  });
});

describe("rejections fall back to the 30-day default", () => {
  const rejects = (params: Parameters<typeof parseAnalyticsRange>[0]) => {
    const result = parseAnalyticsRange(params, NOW);
    expect(result.ok).toBe(false);
    expect(result.range).toEqual(DEFAULT_30D);
    if (!result.ok) expect(result.error).toBeTruthy();
  };

  it("rejects an unknown preset", () => {
    rejects({ range: "7d" });
    rejects({ range: "abc" });
  });

  it("rejects custom without both bounds", () => {
    rejects({ range: "custom", from: "2026-09-01" });
    rejects({ range: "custom", to: "2026-09-30" });
    rejects({ range: "custom" });
  });

  it("rejects dates that don't exist", () => {
    rejects({ range: "custom", from: "2026-02-30", to: "2026-03-05" });
    rejects({ range: "custom", from: "2026-02-29", to: "2026-03-05" });
    rejects({ range: "custom", from: "2026-01-01", to: "2026-13-01" });
  });

  it("rejects malformed dates", () => {
    rejects({ range: "custom", from: "2026-1-5", to: "2026-02-01" });
    rejects({ range: "custom", from: "2026-10-01T00:00", to: "2026-10-21" });
    rejects({ range: "custom", from: "garbage", to: "2026-10-21" });
  });

  it("rejects from after to", () => {
    rejects({ range: "custom", from: "2026-10-15", to: "2026-10-01" });
  });

  it("rejects more than 366 days", () => {
    rejects({ range: "custom", from: "2026-01-01", to: "2027-01-02" });
  });
});

describe("rangeToSearchParams", () => {
  it("writes only the preset for 30d and 90d", () => {
    expect(rangeToSearchParams(DEFAULT_30D)).toEqual({ range: "30d" });
    const ninety = parseAnalyticsRange({ range: "90d" }, NOW).range;
    expect(rangeToSearchParams(ninety)).toEqual({ range: "90d" });
  });

  it("writes from and to for custom", () => {
    const custom = parseAnalyticsRange(
      { range: "custom", from: "2026-09-01", to: "2026-10-15" },
      NOW,
    ).range;
    expect(rangeToSearchParams(custom)).toEqual({
      range: "custom",
      from: "2026-09-01",
      to: "2026-10-15",
    });
  });

  it("round-trips through parseAnalyticsRange", () => {
    for (const params of [
      { range: "30d" },
      { range: "90d" },
      { range: "custom", from: "2026-03-08", to: "2026-11-01" },
    ]) {
      const { range } = parseAnalyticsRange(params, NOW);
      expect(parseAnalyticsRange(rangeToSearchParams(range), NOW)).toEqual({
        ok: true,
        range,
      });
    }
  });
});

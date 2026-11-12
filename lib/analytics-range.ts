// Date range for the admin Analytics tab, parsed from ?range=30d|90d|custom
// (custom adds &from=YYYY-MM-DD&to=YYYY-MM-DD). Days are org-zone calendar
// days; start/end are the instants passed to the analytics database functions.

import { fromDateTimeLocal, orgWallClock } from "./meeting-time";

export type RangePreset = "30d" | "90d" | "custom";

export type AnalyticsRange = {
  preset: RangePreset;
  from: string; // "YYYY-MM-DD", Eastern calendar day, inclusive (for labels and the custom inputs)
  to: string; // "YYYY-MM-DD", Eastern calendar day, inclusive
  start: string; // ISO instant, Eastern 00:00 on `from` -> p_start_time
  end: string; // ISO instant, last ms of `to` in Eastern -> p_end_time
};

// Every chart component takes exactly this.
export type AnalyticsChartProps = { orgId: string; range: AnalyticsRange };

export type AnalyticsRangeParams = {
  range?: string | null;
  from?: string | null;
  to?: string | null;
};

// On failure, `range` is the 30-day default so the tab can still render.
export type AnalyticsRangeResult =
  | { ok: true; range: AnalyticsRange }
  | { ok: false; error: string; range: AnalyticsRange };

// Longest custom range, counted in calendar days including both ends.
export const MAX_CUSTOM_RANGE_DAYS = 366;

const DAY_MS = 86_400_000;
const PRESET_DAYS = { "30d": 30, "90d": 90 } as const;

// Calendar days are held as UTC-midnight ms so day arithmetic never sees DST.
const formatDay = (dayMs: number) => new Date(dayMs).toISOString().slice(0, 10);

/** UTC-midnight ms for a real "YYYY-MM-DD" date, or null. */
function parseDay(value: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const dayMs = Date.UTC(y, m - 1, d);
  // Date.UTC rolls 2026-02-30 over to March; a mismatch means it wasn't real.
  return formatDay(dayMs) === value ? dayMs : null;
}

/** Today's calendar day in the org zone. */
function orgToday(now: Date): number {
  const wc = orgWallClock(now.toISOString());
  if (!wc) throw new RangeError("Invalid current time");
  return Date.UTC(wc.year, wc.month - 1, wc.day);
}

function buildRange(
  preset: RangePreset,
  fromDay: number,
  toDay: number,
): AnalyticsRange | null {
  const start = fromDateTimeLocal(`${formatDay(fromDay)}T00:00`);
  const nextMidnight = fromDateTimeLocal(`${formatDay(toDay + DAY_MS)}T00:00`);
  if (!start || !nextMidnight) return null;
  return {
    preset,
    from: formatDay(fromDay),
    to: formatDay(toDay),
    start,
    // Inclusive end, to match the database functions' `<= p_end_time`.
    end: new Date(new Date(nextMidnight).getTime() - 1).toISOString(),
  };
}

function presetRange(preset: "30d" | "90d", today: number): AnalyticsRange {
  const fromDay = today - (PRESET_DAYS[preset] - 1) * DAY_MS;
  return buildRange(preset, fromDay, today)!;
}

export function parseAnalyticsRange(
  params: AnalyticsRangeParams,
  now: Date,
): AnalyticsRangeResult {
  const today = orgToday(now);
  const fallback = presetRange("30d", today);
  const fail = (error: string): AnalyticsRangeResult => ({
    ok: false,
    error,
    range: fallback,
  });

  const preset = params.range || "30d";
  if (preset === "30d" || preset === "90d") {
    return { ok: true, range: presetRange(preset, today) };
  }
  if (preset !== "custom") return fail(`Unknown range "${preset}".`);

  const fromDay = parseDay(params.from);
  const toDay = parseDay(params.to);
  if (fromDay === null || toDay === null) {
    return fail("Custom range needs valid from and to dates (YYYY-MM-DD).");
  }
  if (fromDay > toDay) return fail("Start date must be on or before end date.");
  if ((toDay - fromDay) / DAY_MS + 1 > MAX_CUSTOM_RANGE_DAYS) {
    return fail(`Custom range can be at most ${MAX_CUSTOM_RANGE_DAYS} days.`);
  }

  const range = buildRange("custom", fromDay, toDay);
  return range ? { ok: true, range } : fail("Invalid date range.");
}

/** Query params for `range`; custom ranges also carry from and to. */
export function rangeToSearchParams(range: AnalyticsRange): Record<string, string> {
  if (range.preset !== "custom") return { range: range.preset };
  return { range: "custom", from: range.from, to: range.to };
}

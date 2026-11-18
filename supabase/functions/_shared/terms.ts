// Single source of truth for semesters: which term a meeting falls in, a term's
// window, and the academic year. Shared by the web stats page (lib/stats-terms.ts)
// and the mobile attendance history (mobile/src/lib/terms.ts).

import { fromDateTimeLocal, orgWallClock } from "./meeting-time";

export type Season = "Spring" | "Summer" | "Fall";
export type Term = { key: string; label: string; season: Season; year: number };
export type TermKey = Term["key"];

const SEASON_ORDER: Record<Season, number> = { Spring: 0, Summer: 1, Fall: 2 };

function makeTerm(season: Season, year: number): Term {
  return { key: `${year}-${season}`, label: `${season} ${year}`, season, year };
}

// Jan–May is Spring, Jun–Jul is Summer, Aug–Dec is Fall. month is 1-12.
export function termForMonth(year: number, month: number): Term {
  const season: Season = month <= 5 ? "Spring" : month <= 7 ? "Summer" : "Fall";
  return makeTerm(season, year);
}

// "2026-Fall" back into a Term.
export function termFromKey(key: TermKey): Term {
  const [yearStr, season] = key.split("-") as [string, Season];
  return makeTerm(season, Number(yearStr));
}

// Classify by the meeting's date IN THE ORG'S TIMEZONE.
//
// This used to slice the year and month straight out of the string, which was
// right while start_time was a tz-less Eastern wall clock. Now that it is
// timestamptz the leading characters are UTC, and a meeting at 11 PM Eastern on
// Dec 31 reads as Jan 1 -- filing it under Spring of the following year instead
// of Fall. Still never uses Date.getMonth(), which would depend on the server's
// timezone rather than the club's.
export function getTerm(startTime: string): Term {
  const wc = orgWallClock(startTime);
  const year = wc ? wc.year : Number(startTime.slice(0, 4));
  const month = wc ? wc.month : Number(startTime.slice(5, 7)); // 1-12
  return termForMonth(year, month);
}

export function compareTermsDesc(
  a: { season: Season; year: number },
  b: { season: Season; year: number },
): number {
  if (a.year !== b.year) return b.year - a.year;
  return SEASON_ORDER[b.season] - SEASON_ORDER[a.season];
}

// Term windows, as real instants.
//
// These are passed to get_member_meetings_page and compared against
// meetings.start_time (timestamptz). A bare wall-clock string would be read in
// the server's zone (UTC), shifting each window ~4-5 hours and letting meetings
// near a term boundary fall into the wrong term -- or out of every term.
export function termBounds(key: TermKey): { startIso: string; endIso: string } {
  const { season, year } = termFromKey(key);
  const bounds = (start: string, end: string) => ({
    startIso: fromDateTimeLocal(start) ?? start,
    endIso: fromDateTimeLocal(end) ?? end,
  });
  switch (season) {
    case "Spring": return bounds(`${year}-01-01T00:00`, `${year}-05-31T23:59`);
    case "Summer": return bounds(`${year}-06-01T00:00`, `${year}-07-31T23:59`);
    case "Fall":   return bounds(`${year}-08-01T00:00`, `${year}-12-31T23:59`);
  }
}

// AY starts in August. Aug–Dec → AY start = this year; Jan–Jul → previous year.
export function academicYearTerms(year: number, month: number): TermKey[] {
  const startYear = month >= 8 ? year : year - 1;
  return [`${startYear}-Fall`, `${startYear + 1}-Spring`, `${startYear + 1}-Summer`];
}

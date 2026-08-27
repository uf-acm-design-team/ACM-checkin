// Shared types + pure helpers for the member attendance stats feature.
// No I/O — everything here is unit-tested and orchestrated by lib/stats-data.ts.

import type { AnswerMap, FormSchema } from "./form-schema";
import { fromDateTimeLocal, orgWallClock } from "./meeting-time";

export type Season = "Spring" | "Summer" | "Fall";
export type Term = { key: string; label: string; season: Season; year: number };
export type TermKey = Term["key"];
export type View = "attended" | "missed" | "all";
export type Scope = TermKey | "all";

export type StatsMeeting = {
  id: string;
  title: string;
  start_time: string;
  attended: boolean;
  description?: string;
  hasDetails: boolean; // description present OR the meeting has form questions
};

export type MeetingDetails = {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  description: string | null;
  questions: FormSchema;
  /**
   * The user's answers keyed by question id, or null if they didn't attend.
   *
   * Keyed rather than positional so reordering or rewording a question can't
   * silently re-point historical answers -- see the migration that introduced
   * form_schema.
   */
  answers: AnswerMap | null;
};

export type TermSummary = {
  key: string;
  label: string;
  season: Season;
  year: number;
  attended: number; // this user, occurred only
  total: number;    // org, occurred only
};

export type MemberStats = {
  orgId: string;
  orgName: string;
  attendeeId: string | null;
  role: string | null;
  status: string | null;
  isMember: boolean;
  threshold: number | null; // null = org has no attendance-based membership gate
  remaining: number;
  attendedAllTime: number;
  totalAllTime: number;
  terms: TermSummary[];
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type MeetingRow = { id: string; start_time: string };

const SEASON_ORDER: Record<Season, number> = { Spring: 0, Summer: 1, Fall: 2 };

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
  const season: Season = month <= 5 ? "Spring" : month <= 7 ? "Summer" : "Fall";
  return { key: `${year}-${season}`, label: `${season} ${year}`, season, year };
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
  const [yearStr, season] = key.split("-") as [string, Season];
  const year = Number(yearStr);
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

export function buildTermSummaries(
  orgMeetings: MeetingRow[],
  attendedMeetingIds: Set<string>,
): { terms: TermSummary[]; totalAllTime: number; attendedAllTime: number } {
  const map = new Map<string, TermSummary>();
  let totalAllTime = 0;
  let attendedAllTime = 0;
  for (const m of orgMeetings) {
    const t = getTerm(m.start_time);
    totalAllTime++;
    const attended = attendedMeetingIds.has(m.id);
    if (attended) attendedAllTime++;
    const existing = map.get(t.key);
    if (existing) {
      existing.total++;
      if (attended) existing.attended++;
    } else {
      map.set(t.key, {
        key: t.key, label: t.label, season: t.season, year: t.year,
        total: 1, attended: attended ? 1 : 0,
      });
    }
  }
  const terms = Array.from(map.values()).sort(compareTermsDesc);
  return { terms, totalAllTime, attendedAllTime };
}

export function pageRange(page: number, pageSize: number): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function hasMore(page: number, pageSize: number, total: number): boolean {
  return page * pageSize < total;
}

export function percentage(attended: number, total: number): number {
  return total === 0 ? 0 : Math.round((attended / total) * 100);
}

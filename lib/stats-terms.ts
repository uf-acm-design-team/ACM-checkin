// Shared types + pure helpers for the member attendance stats feature.
// No I/O — everything here is unit-tested and orchestrated by lib/stats-data.ts.
// The semester rules live in supabase/functions/_shared/terms.ts, shared with
// the mobile app, and are re-exported here.

import type { AnswerMap, FormSchema } from "./form-schema";
import {
  compareTermsDesc,
  getTerm,
  type Season,
  type TermKey,
} from "../supabase/functions/_shared/terms";

export {
  academicYearTerms,
  compareTermsDesc,
  getTerm,
  termBounds,
  type Season,
  type Term,
  type TermKey,
} from "../supabase/functions/_shared/terms";

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

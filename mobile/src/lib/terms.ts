// Semesters for the attendance history screen. The rules (which semester a
// meeting falls in, a semester's window, the academic year) come from
// supabase/functions/_shared/terms.ts, the same code the website uses, so mobile
// files meetings under the same semester. This file only adapts them to the
// shapes the screens use.

import { orgWallClock } from '../../../supabase/functions/_shared/meeting-time';
import {
  academicYearTerms as sharedAcademicYearTerms,
  termBounds as sharedTermBounds,
  termForMonth as sharedTermForMonth,
  termFromKey,
  type Term,
} from '../../../supabase/functions/_shared/terms';

export { ORG_TIME_ZONE } from '../../../supabase/functions/_shared/meeting-time';
export { getTerm, type Season, type Term } from '../../../supabase/functions/_shared/terms';

// A calendar month, with month counted 1-12.
export type YearMonth = { year: number; month: number };

// The month and day an instant falls on in the org's time zone.
export function orgDate(iso: string): YearMonth & { day: number } {
  const { year, month, day } = orgWallClock(iso) ?? { year: NaN, month: NaN, day: NaN };
  return { year, month, day };
}

// Jan–May is Spring, Jun–Jul is Summer, Aug–Dec is Fall.
export function termForMonth({ year, month }: YearMonth): Term {
  return sharedTermForMonth(year, month);
}

// The first month of a semester.
export function firstMonth(term: Term): YearMonth {
  const month = term.season === 'Spring' ? 1 : term.season === 'Summer' ? 6 : 8;
  return { year: term.year, month };
}

// The first and last instant of a semester, to pass to get_member_meetings_page.
export function termBounds(term: Term): { start: string; end: string } {
  const { startIso, endIso } = sharedTermBounds(term.key);
  return { start: startIso, end: endIso };
}

// The academic year containing `iso`: Fall, then the next Spring and Summer.
export function academicYearTerms(iso: string): Term[] {
  const { year, month } = orgDate(iso);
  return sharedAcademicYearTerms(year, month).map(termFromKey);
}

// Semesters for the attendance history screen. Mirrors getTerm, termBounds and
// academicYearTerms in lib/stats-terms.ts so mobile files meetings under the
// same semester as the website. Mobile can't import lib/, so switch this to the
// shared copy once stats-terms moves to supabase/functions/_shared.

export const ORG_TIME_ZONE = 'America/New_York';

export type Season = 'Spring' | 'Summer' | 'Fall';
export type Term = { key: string; label: string; season: Season; year: number };

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: ORG_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

// The date and time on a wall clock in the org's time zone.
function orgWallClock(date: Date) {
  const parts: Record<string, number> = {};
  for (const part of PARTS.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return parts as { year: number; month: number; day: number; hour: number; minute: number };
}

// The instant when the org's wall clock reads this date and time.
function orgInstant(year: number, month: number, day: number, hour: number, minute: number): string {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(target);
  for (let i = 0; i < 2; i++) {
    const wc = orgWallClock(guess);
    const drift = target - Date.UTC(wc.year, wc.month - 1, wc.day, wc.hour % 24, wc.minute);
    if (drift === 0) break;
    guess = new Date(guess.getTime() + drift);
  }
  return guess.toISOString();
}

function makeTerm(season: Season, year: number): Term {
  return { key: `${year}-${season}`, label: `${season} ${year}`, season, year };
}

// A calendar month, with month counted 1-12.
export type YearMonth = { year: number; month: number };

// The month and day an instant falls on in the org's time zone.
export function orgDate(iso: string): YearMonth & { day: number } {
  const { year, month, day } = orgWallClock(new Date(iso));
  return { year, month, day };
}

// Jan–May is Spring, Jun–Jul is Summer, Aug–Dec is Fall.
export function termForMonth({ year, month }: YearMonth): Term {
  const season: Season = month <= 5 ? 'Spring' : month <= 7 ? 'Summer' : 'Fall';
  return makeTerm(season, year);
}

// The semester an instant falls in, by the org's calendar.
export function getTerm(iso: string): Term {
  return termForMonth(orgDate(iso));
}

// The first month of a semester.
export function firstMonth(term: Term): YearMonth {
  const month = term.season === 'Spring' ? 1 : term.season === 'Summer' ? 6 : 8;
  return { year: term.year, month };
}

// The first and last instant of a semester, to pass to get_member_meetings_page.
export function termBounds(term: Term): { start: string; end: string } {
  const [startMonth, endMonth, endDay] =
    term.season === 'Spring' ? [1, 5, 31] : term.season === 'Summer' ? [6, 7, 31] : [8, 12, 31];
  return {
    start: orgInstant(term.year, startMonth, 1, 0, 0),
    end: orgInstant(term.year, endMonth, endDay, 23, 59),
  };
}

// The academic year containing `iso`: Fall, then the next Spring and Summer.
export function academicYearTerms(iso: string): Term[] {
  const { year, month } = orgWallClock(new Date(iso));
  const fallYear = month >= 8 ? year : year - 1;
  return [makeTerm('Fall', fallYear), makeTerm('Spring', fallYear + 1), makeTerm('Summer', fallYear + 1)];
}

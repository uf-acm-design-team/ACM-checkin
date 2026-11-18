// Month grid for the attendance calendar. Pure, so it's easy to test.

import { orgDate, type YearMonth } from './terms';

export type DayStatus = 'attended' | 'missed' | 'upcoming';

export type CalendarDay = {
  day: number;
  titles: string[];
  status: DayStatus | null;
  isToday: boolean;
  // The colour of the org you checked in with that day, if you did.
  checkedInColor: string | null;
  // One per meeting that day, in its org's colour, soonest first.
  dots: string[];
};

// `accent` is the meeting's org colour. Without one, the day uses the app accent.
type Meeting = { title: string; startTime: string; attended: boolean; accent?: string };

// One cell per square of a Sunday-first month grid. null cells pad the first
// week so day 1 lands under the right weekday.
export function monthGrid(
  { year, month }: YearMonth,
  meetings: Meeting[],
  now: string,
): (CalendarDay | null)[] {
  const leading = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = orgDate(now);
  const nowMs = new Date(now).getTime();

  const byDay = new Map<number, Meeting[]>();
  for (const meeting of meetings) {
    const date = orgDate(meeting.startTime);
    if (date.year !== year || date.month !== month) continue;
    byDay.set(date.day, [...(byDay.get(date.day) ?? []), meeting]);
  }

  const cells: (CalendarDay | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    const dayMeetings = byDay.get(day) ?? [];
    let status: DayStatus | null = null;
    if (dayMeetings.some((meeting) => meeting.attended)) status = 'attended';
    else if (dayMeetings.some((meeting) => new Date(meeting.startTime).getTime() > nowMs)) status = 'upcoming';
    else if (dayMeetings.length > 0) status = 'missed';

    const sorted = [...dayMeetings].sort((a, b) => a.startTime.localeCompare(b.startTime));
    cells.push({
      day,
      titles: dayMeetings.map((meeting) => meeting.title),
      status,
      isToday: today.year === year && today.month === month && today.day === day,
      checkedInColor: sorted.find((meeting) => meeting.attended)?.accent ?? null,
      dots: sorted.map((meeting) => meeting.accent ?? ''),
    });
  }
  return cells;
}

export function addMonths({ year, month }: YearMonth, count: number): YearMonth {
  const index = year * 12 + (month - 1) + count;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function monthLabel({ year, month }: YearMonth): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
}

// Which meetings are upcoming, and which one is "next", for an org. Shared by
// the officer dashboard's Next Meeting card (app/[orgSlug]/admin-dashboard)
// and the club cards on the mobile Home screen, so both name the same meeting.

export type ScheduledMeeting = {
  start_time: string;
  end_time: string | null;
  status: boolean | null;
};

// "Upcoming" keys off end_time, not start_time: a meeting that is running is
// still upcoming -- people are checking into it. Keying off start_time filed
// in-progress meetings under "Past" the moment they began. Without an end
// time, the start stands in for it.
export function hasEnded(m: ScheduledMeeting, now: number): boolean {
  return new Date(m.end_time || m.start_time).getTime() < now;
}

/** Meetings that haven't ended by `now` (ms), soonest first. */
export function upcomingMeetings<T extends ScheduledMeeting>(meetings: readonly T[], now: number): T[] {
  return meetings
    .filter((m) => !hasEnded(m, now))
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
}

/**
 * What the club actually does next: the first upcoming meeting that is open.
 *
 * A meeting an officer has closed is still upcoming -- it is on the calendar
 * and can be reopened -- but it is not what happens next, and surfacing it
 * meant a finished test meeting sat on the dashboard indefinitely. Falls back
 * to the first upcoming meeting when every one is closed, rather than to
 * "nothing scheduled" when something plainly is.
 */
export function nextMeeting<T extends ScheduledMeeting>(meetings: readonly T[], now: number): T | undefined {
  const upcoming = upcomingMeetings(meetings, now);
  return upcoming.find((m) => m.status) ?? upcoming[0];
}

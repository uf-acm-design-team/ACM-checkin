/**
 * Whether `now` falls inside a meeting's scheduled [start_time, end_time]. A
 * null bound is unbounded on that side.
 *
 * A copy of isWithinMeetingWindow in supabase/functions/_shared/meeting-time.ts
 * (re-exported by web's lib/meeting-time.ts), which the web check-in page and
 * the member-check-in function both filter open meetings with.
 * `meetings.status` is only the officer's on/off switch: a meeting can be
 * opened before it starts, and the auto-close cron can leave a just-ended one
 * open for up to a minute. Filtering the same way keeps the picker from
 * offering a meeting the check-in would then reject. Metro can't load files
 * outside mobile/, hence the copy; meeting-time.test.ts checks it against web's.
 */
export function isWithinMeetingWindow(now: Date, startTime: string | null, endTime: string | null): boolean {
  const t = now.getTime();
  if (startTime && t < new Date(startTime).getTime()) return false;
  if (endTime && t > new Date(endTime).getTime()) return false;
  return true;
}

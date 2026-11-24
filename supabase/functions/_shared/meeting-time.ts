// Timezone handling for meeting start/end times.
//
// meetings.start_time and meetings.end_time are `timestamptz`. They used to be
// `timestamp without time zone` holding a bare Eastern wall-clock string, which
// is why several call sites read them by slicing characters out of the raw
// string -- correct for a naive value, wrong for one carrying a UTC offset.
//
// PostgREST now returns them as "2026-09-03T19:00:00+00:00". The instant is
// unambiguous, but every place that shows or edits a time has to convert to the
// org's local zone explicitly rather than trusting the string's leading
// characters (which are UTC) or the viewer's own machine (which may be
// travelling).
//
// ORG_TIME_ZONE is currently a constant. It is the one thing to change if the
// platform ever hosts a club outside Eastern -- at which point it should move
// onto the organizations row and be threaded through these helpers as an
// argument. Everything else here already works per-zone.

export const ORG_TIME_ZONE = "America/New_York";

// Intl gives us the wall-clock parts of an instant IN A CHOSEN ZONE, which is
// exactly the conversion these helpers need and the one Date's own getters
// cannot do (they only offer UTC or the runtime's local zone).
const PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: ORG_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type WallClock = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
};

/** The wall-clock parts of `iso` as seen in the org's timezone. */
export function orgWallClock(iso: string): WallClock | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts: Record<string, string> = {};
  for (const p of PARTS_FORMATTER.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // en-CA with hour12:false yields 24-hour values, but midnight can come
    // back as "24" in some engines -- normalize it to 0.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Format an instant for <input type="datetime-local">, which requires exactly
 * "YYYY-MM-DDTHH:mm" and has no concept of a timezone.
 *
 * Replaces the old `.slice(0, 16)`: that took the FIRST 16 characters of the
 * raw column value, which are now the UTC wall clock. A 3:00 PM Eastern meeting
 * would have prefilled as 7:00 PM, and saving would push it four hours later
 * every time the editor was opened.
 */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const wc = orgWallClock(iso);
  if (!wc) return "";
  return `${wc.year}-${pad(wc.month)}-${pad(wc.day)}T${pad(wc.hour)}:${pad(wc.minute)}`;
}

/**
 * Convert a "YYYY-MM-DDTHH:mm" value from <input type="datetime-local"> into an
 * ISO instant, interpreting it as a wall-clock time in the org's zone.
 *
 * Sending the bare string would let Postgres interpret it in the SERVER's zone
 * (UTC on Supabase), so 3:00 PM Eastern would be stored as 3:00 PM UTC -- the
 * same four-hour error the auto-close cron was built on.
 *
 * Works by guessing UTC, measuring how far off the guess lands once rendered
 * back in the org zone, and correcting. The second pass settles DST boundaries,
 * where the offset the correction needs is not the offset the guess had.
 */
export function fromDateTimeLocal(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as unknown as number[];

  const targetUtc = Date.UTC(y, mo - 1, d, h, mi);
  let guess = new Date(targetUtc);

  for (let i = 0; i < 2; i++) {
    const wc = orgWallClock(guess.toISOString());
    if (!wc) return null;
    const landedUtc = Date.UTC(wc.year, wc.month - 1, wc.day, wc.hour, wc.minute);
    const drift = targetUtc - landedUtc;
    if (drift === 0) break;
    guess = new Date(guess.getTime() + drift);
  }

  return guess.toISOString();
}

/** Whether `iso` is strictly before `other` (plain instant comparison). */
export function isBefore(iso: string, other: string): boolean {
  return new Date(iso).getTime() < new Date(other).getTime();
}

/**
 * Whether `now` falls inside [startTime, endTime]. A null bound is
 * unbounded on that side -- the same convention close_expired_meetings()
 * uses for end_time, applied symmetrically to start_time.
 *
 * meetings.status is an officer's on/off switch and says nothing about
 * whether the meeting's own scheduled window has actually arrived yet (a
 * meeting can be opened ahead of start_time) or already passed (the
 * auto-close cron only runs once a minute, so a just-ended meeting can sit
 * open briefly). This is the check that closes both gaps.
 */
export function isWithinMeetingWindow(
  now: Date,
  startTime: string | null,
  endTime: string | null,
): boolean {
  const t = now.getTime();
  if (startTime && t < new Date(startTime).getTime()) return false;
  if (endTime && t > new Date(endTime).getTime()) return false;
  return true;
}

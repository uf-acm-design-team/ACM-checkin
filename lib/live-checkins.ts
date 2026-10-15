// Pure helpers for the admin live check-in feed.

export interface FeedKey {
  id: string;
  checked_in_at: string;
}

// Newest first; id breaks ties so the order is stable across fetches.
export function compareNewestFirst(a: FeedKey, b: FeedKey): number {
  const diff = Date.parse(b.checked_in_at) - Date.parse(a.checked_in_at);
  if (diff !== 0) return diff;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

// Merges rows by id, keeping the existing copy, and returns them newest first.
export function mergeNewest<T extends FeedKey>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(existing.map((r) => r.id));
  const added = incoming.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  if (added.length === 0) return existing;
  return [...existing, ...added].sort(compareNewestFirst);
}

// PostgREST `or` filter for rows strictly older than the cursor (keyset paging).
export function olderThanFilter(cursor: FeedKey): string {
  return `checked_in_at.lt.${cursor.checked_in_at},and(checked_in_at.eq.${cursor.checked_in_at},id.lt.${cursor.id})`;
}

export type CheckInSource = "guest" | "member";

// attendance.source is "guest" or "authenticated"; anything else is unlabeled.
export function sourceLabel(source: string | null | undefined): CheckInSource | null {
  if (source === "guest") return "guest";
  if (source === "authenticated") return "member";
  return null;
}

// Open means check-in is enabled and the end time, if any, has not passed.
export function isMeetingOpen(
  meeting: { status: boolean; end_time: string | null },
  now: number,
): boolean {
  if (!meeting.status) return false;
  return !meeting.end_time || Date.parse(meeting.end_time) > now;
}

// Milliseconds until the meeting auto-closes, or null when it has no end time.
export function msUntilClose(end_time: string | null, now: number): number | null {
  if (!end_time) return null;
  return Math.max(0, Date.parse(end_time) - now);
}

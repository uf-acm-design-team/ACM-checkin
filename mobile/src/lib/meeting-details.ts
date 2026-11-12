// Wording for the meeting details sheet. Pure, so it's easy to test.

import { orgDate } from './terms';

/** "Today", "Tomorrow" or "In 9 days", by the org's calendar days, not 24-hour blocks. */
export function daysAway(startIso: string, nowIso: string): string {
  const start = orgDate(startIso);
  const now = orgDate(nowIso);
  const days = Math.round(
    (Date.UTC(start.year, start.month - 1, start.day) - Date.UTC(now.year, now.month - 1, now.day)) / 86_400_000,
  );
  if (days <= 0) return 'Today';
  return days === 1 ? 'Tomorrow' : `In ${days} days`;
}

/** A saved check-in answer as one line of text. Empty when the question was skipped. */
export function formatAnswer(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatAnswer).filter(Boolean).join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

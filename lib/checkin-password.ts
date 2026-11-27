/**
 * Meeting check-in password matching, decided in AC-9.
 *
 * Phones capitalise the first letter of a text field and keyboards add stray
 * spaces, so "ACM2026", "acm2026" and " Acm2026 " must all count as the same
 * password. The stored value is never rewritten: officers still see exactly
 * what they typed, and both sides are normalised only when compared.
 *
 * Two servers check passwords:
 * - guests: guestCheckIn (app/[orgSlug]/checkin/guest-actions.ts) uses
 *   checkinPasswordMatches() below;
 * - members (web + mobile): the member-check-in edge function calls the SQL
 *   function verify_meeting_checkin_password, which repeats this rule in SQL
 *   (see 20261126000000_checkin_password_case_insensitive.sql).
 * Change both together.
 *
 * Web-only: no edge function or mobile code uses it, so it lives in lib/
 * rather than supabase/functions/_shared/.
 */

/**
 * The form both sides are reduced to before comparing.
 *
 * Only ASCII whitespace (space, tab, CR, LF) counts as "extra space": JS
 * trim() and Postgres's \s disagree on Unicode spaces such as NBSP, and the
 * SQL copy of this rule has to match it exactly.
 */
export function normalizeCheckinPassword(value: string): string {
  return value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "").toLowerCase();
}

/** True when `given` unlocks a meeting whose password is `stored`. No password set -> true. */
export function checkinPasswordMatches(
  stored: string | null | undefined,
  given: string | null | undefined,
): boolean {
  if (!stored) return true;
  return normalizeCheckinPassword(stored) === normalizeCheckinPassword(given ?? "");
}

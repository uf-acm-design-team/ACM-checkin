/**
 * Case-insensitive email matching through PostgREST's ilike.
 *
 * attendees has a unique index on lower(email), so lookups use ilike() rather
 * than eq() -- eq() would miss "Ada@ufl.edu" against "ada@ufl.edu". But ilike
 * takes a pattern, not a value: `_` matches any one character and `%` any run,
 * so `.ilike("email", "john_doe@gmail.com")` also matched johnxdoe@gmail.com.
 * On the guest-claim paths that let a new account take over someone else's
 * attendee row and attendance history.
 *
 * Shared by the Next app (re-exported from lib/email-match.ts) and the Deno
 * edge functions, so it must stay dependency-free.
 */

/**
 * Escape LIKE metacharacters (`\`, `%`, `_`) so ilike matches them literally.
 * Backslash is Postgres's default LIKE escape character.
 *
 * Not exact on its own: PostgREST rewrites every `*` in a like/ilike value to
 * `%` and offers no escape for it, so an email containing `*` still widens the
 * match. Either confirm candidates with sameEmail() before acting on them, or
 * skip the query when hasUnescapableWildcard() is true.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** True when escapeLikePattern() can't make an ilike on this value exact. */
export function hasUnescapableWildcard(value: string): boolean {
  return value.includes("*");
}

/** Exact, case-insensitive email equality -- what lower(email) = lower(x) means. */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

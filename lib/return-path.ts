/**
 * Where to send someone after sign-in / onboarding, when a page asked to be
 * returned to.
 *
 * A member who taps "Sign in instead" on the check-in page has to come back to
 * that check-in page, not the dashboard -- they were mid-way through checking
 * in. Clerk's <SignIn /> honours `?redirect_url=` for existing accounts, but a
 * brand-new account is force-redirected to /onboarding and the parameter is
 * lost, so the return path is also kept in sessionStorage for onboarding to
 * pick up.
 *
 * Either way the value is caller-controlled (a query string, or storage any
 * script on the origin can write), so it is only ever followed if it is a
 * same-site path. Anything else -- an absolute URL, a protocol-relative
 * `//evil.com`, or a backslash form browsers normalise into one -- is an open
 * redirect and is dropped.
 */

/** sessionStorage key the check-in page writes and onboarding reads. */
export const RETURN_PATH_KEY = "checkin:returnTo";

export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/")) return null;
  // "//host" and "/\host" are both treated as a new origin by browsers.
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  // Control characters (tabs, newlines) are stripped by URL parsers and can
  // turn "/\t/evil.com" into "//evil.com".
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

/** The check-in page for an org -- what "Sign in instead" asks to return to. */
export function checkinReturnPath(orgSlug: string): string {
  return `/${encodeURIComponent(orgSlug)}/checkin`;
}

/**
 * Where onboarding may send someone back to after they finish their profile.
 *
 * Only an org's check-in page, `/<slug>/checkin`, is accepted. Anything else
 * (an absolute URL, `//host`, a path with a query, or any other route) returns
 * null and onboarding falls back to /dashboard, so a crafted
 * `?redirect_url=` can't turn the page into an open redirect.
 */
const CHECKIN_PATH = /^\/[A-Za-z0-9_-]+\/checkin$/;

export function checkinReturnPath(value: string | null | undefined): string | null {
  if (!value) return null;
  return CHECKIN_PATH.test(value) ? value : null;
}

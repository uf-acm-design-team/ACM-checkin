/**
 * The public check-in URL for an org -- what its QR code encodes.
 *
 * This is the ONLY place the link format is defined. The final format is not
 * decided yet (a plain web URL today; possibly an app link that opens the
 * mobile app when installed), so every QR surface must build the link through
 * here and the switch stays a one-line change.
 *
 * `origin` is passed in rather than read from `window`, so the same function
 * works in the browser, on the server, and in tests. Trailing slashes are
 * trimmed so "https://example.com/" doesn't produce a "//" in the path.
 */
export function buildCheckinLink(slug: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}/${encodeURIComponent(slug)}/checkin`;
}

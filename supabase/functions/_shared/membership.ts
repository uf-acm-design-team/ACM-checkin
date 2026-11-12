// Single source of truth for org membership thresholds and member status.
// Shared by the check-in flow (app/[orgSlug]/checkin/actions.ts) and the
// member stats layer (lib/stats-data.ts).

// Keyed by lowercase org slug. Org slugs are stored lowercase (e.g. "acm"), so
// the lookup lowercases too — a "ACM" key would silently miss and fall back to
// the "unconfigured" case.
export const ORG_MEMBERSHIP_THRESHOLDS: Record<string, number> = {
  // Add org slugs (lowercase) and their required attendance count here.
  acm: 3,
};

// An org that isn't in the map has NO attendance-based membership gate: its
// threshold is null, not 0. A numeric 0 default is a bug — `attended >= 0` is
// true for everyone, so every visitor (even with zero attendance) would read as
// a member. With null, membership for an unconfigured org comes only from an
// explicit active status / role, never from a bare count.
export function membershipThreshold(orgSlug: string): number | null {
  return ORG_MEMBERSHIP_THRESHOLDS[orgSlug.toLowerCase()] ?? null;
}

export function resolveMembership(
  role: string | null,
  status: string | null,
  attendedAllTime: number,
  orgSlug: string,
): { threshold: number | null; isMember: boolean; remaining: number } {
  const threshold = membershipThreshold(orgSlug);
  const meetsThreshold = threshold !== null && attendedAllTime >= threshold;
  const isMember = status === "active" || meetsThreshold;
  const remaining = threshold === null ? 0 : Math.max(threshold - attendedAllTime, 0);
  return { threshold, isMember, remaining };
}

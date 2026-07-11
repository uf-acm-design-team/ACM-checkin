// Single source of truth for org membership thresholds and member status.
// Shared by the check-in flow (app/[orgSlug]/checkin/actions.ts) and the
// member stats layer (lib/stats-data.ts).

// Keyed by lowercase org slug. Org slugs are stored lowercase (e.g. "acm"), so
// the lookup lowercases too — a "ACM" key would silently miss and fall back to
// the default, making everyone a member.
export const ORG_MEMBERSHIP_THRESHOLDS: Record<string, number> = {
  // Add org slugs (lowercase) and their required attendance count here.
  acm: 3,
};
export const DEFAULT_THRESHOLD = 0;

export function membershipThreshold(orgSlug: string): number {
  return ORG_MEMBERSHIP_THRESHOLDS[orgSlug.toLowerCase()] ?? DEFAULT_THRESHOLD;
}

export function resolveMembership(
  role: string | null,
  status: string | null,
  attendedAllTime: number,
  orgSlug: string,
): { threshold: number; isMember: boolean; remaining: number } {
  const threshold = membershipThreshold(orgSlug);
  const isMember = status === "active" || attendedAllTime >= threshold;
  const remaining = Math.max(threshold - attendedAllTime, 0);
  return { threshold, isMember, remaining };
}

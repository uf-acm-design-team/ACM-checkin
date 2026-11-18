// Single source of truth for org membership thresholds and member status.
// Shared by the check-in flow (app/[orgSlug]/checkin/actions.ts) and the
// member stats layer (lib/stats-data.ts).

// Every org gets the same attendance-based membership, so a club added to the
// database gets badges and membership progress like the rest without a code
// change. DEFAULT_MEMBERSHIP_THRESHOLD is the check-ins needed to become a
// member; ORG_MEMBERSHIP_THRESHOLDS overrides it for one org. AC-24 moves the
// number into the organizations table so each club can set its own.
//
// Never 0: `attended >= 0` is true for everyone, so every visitor (even with
// zero attendance) would read as a member.
export const DEFAULT_MEMBERSHIP_THRESHOLD = 3;

// Keyed by lowercase org slug. Org slugs are stored lowercase (e.g. "acm"), so
// the lookup lowercases too.
export const ORG_MEMBERSHIP_THRESHOLDS: Record<string, number> = {
  acm: 3,
};

export function membershipThreshold(orgSlug: string): number {
  return ORG_MEMBERSHIP_THRESHOLDS[orgSlug.toLowerCase()] ?? DEFAULT_MEMBERSHIP_THRESHOLD;
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

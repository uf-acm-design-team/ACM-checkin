import type { MyCheckIn, MyMembership, Organization } from '@/lib/supabase';
import { membershipThreshold } from '@/lib/org-display';
import { getTerm, termBounds, type Term } from '@/lib/terms';

// One org you belong to and how many of its meetings you checked in to that semester.
export type ProfileOrg = { org: Organization; count: number };

// A semester badge for an org that has a membership threshold.
export type ProfileBadge = ProfileOrg & { threshold: number; earned: boolean };

export type SemesterProfile = {
  orgs: ProfileOrg[];
  badges: ProfileBadge[];
  // True once `term` is over, so unearned badges are final rather than in progress.
  ended: boolean;
  summary: string;
};

const byCountThenName = (a: ProfileOrg, b: ProfileOrg) =>
  b.count - a.count || (a.org.name ?? '').localeCompare(b.org.name ?? '');

// Counts only the chosen semester's check-ins, unlike the all-time membership on Home.
export function semesterProfile(
  memberships: MyMembership[],
  checkIns: MyCheckIn[],
  term: Term,
  now: string,
): SemesterProfile {
  const counts = new Map<string, number>();
  for (const checkIn of checkIns) {
    if (getTerm(checkIn.startTime).key !== term.key) continue;
    counts.set(checkIn.orgId, (counts.get(checkIn.orgId) ?? 0) + 1);
  }

  const orgs = memberships
    .filter((membership) => membership.organization)
    .map((membership) => ({ org: membership.organization, count: counts.get(membership.org_id) ?? 0 }))
    .sort(byCountThenName);

  const badges = orgs
    .flatMap((entry) => {
      const threshold = membershipThreshold(entry.org.slug);
      return threshold === null ? [] : [{ ...entry, threshold, earned: entry.count >= threshold }];
    })
    .sort((a, b) => Number(b.earned) - Number(a.earned) || byCountThenName(a, b));

  const ended = Date.parse(termBounds(term).end) < Date.parse(now);
  const earned = badges.filter((badge) => badge.earned).length;
  const rest = badges.length - earned;
  const summary = `${earned} earned · ${rest} ${ended ? 'not earned' : 'in progress'}`;

  return { orgs, badges, ended, summary };
}

export function eventCount(count: number): string {
  return `${count} ${count === 1 ? 'event' : 'events'}`;
}

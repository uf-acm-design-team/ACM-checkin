import type { Organization } from '@/lib/supabase';

export type OrgResult = { org: Organization; yours: boolean };

const label = (org: Organization) => (org.name ?? org.slug ?? '').trim();

/**
 * Orgs whose name or slug contains `query` (ignoring case), A to Z. An empty
 * query lists every org. Orgs you're already in stay in the list, flagged, so
 * searching for one doesn't look like it's missing.
 */
export function searchOrgs(orgs: Organization[], query: string, myOrgIds: ReadonlySet<string>): OrgResult[] {
  const needle = query.trim().toLowerCase();
  return orgs
    .filter((org) => !needle || label(org).toLowerCase().includes(needle) || (org.slug ?? '').toLowerCase().includes(needle))
    .sort((a, b) => label(a).localeCompare(label(b)))
    .map((org) => ({ org, yours: myOrgIds.has(org.id) }));
}

import type { Organization } from '@/lib/supabase';

import { searchOrgs } from './org-search';

const org = (id: string, slug: string, name: string | null): Organization => ({
  id,
  slug,
  name,
  branding: null,
  created_at: '2026-01-01T00:00:00Z',
});

const orgs = [org('3', 'colorstack', 'ColorStack'), org('1', 'acm', 'ACM'), org('2', 'aed', 'AED')];

describe('searchOrgs', () => {
  it('lists every org A to Z for an empty search, flagging yours', () => {
    expect(searchOrgs(orgs, '  ', new Set(['1']))).toEqual([
      { org: orgs[1], yours: true },
      { org: orgs[2], yours: false },
      { org: orgs[0], yours: false },
    ]);
  });

  it('matches part of the name or slug, ignoring case', () => {
    expect(searchOrgs(orgs, 'STACK', new Set()).map((r) => r.org.id)).toEqual(['3']);
    expect(searchOrgs(orgs, 'ae', new Set()).map((r) => r.org.id)).toEqual(['2']);
  });

  it('returns nothing when no org matches', () => {
    expect(searchOrgs(orgs, 'chess', new Set())).toEqual([]);
  });
});

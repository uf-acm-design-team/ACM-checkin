import type { MyCheckIn, MyMembership } from '@/lib/supabase';
import { getTerm } from '@/lib/terms';

import { eventCount, orgActivity, semesterProfile } from './profile-badges';

// Only ACM has a threshold in the app today; give IEEE and SHPE one too so ordering can be tested.
jest.mock('@/lib/org-display', () => ({
  membershipThreshold: (slug: string | null) => ({ acm: 3, ieee: 2, shpe: 2 })[slug ?? ''] ?? null,
}));

const membership = (id: string, slug: string, name: string): MyMembership => ({
  org_id: id,
  role: 'member',
  status: 'pending',
  created_at: '2026-08-01T00:00:00Z',
  organization: { id, slug, name, branding: null, created_at: '2026-08-01T00:00:00Z' },
});

const acm = membership('org-acm', 'acm', 'ACM');
const wece = membership('org-wece', 'wece', 'WECE');

const fall = getTerm('2026-10-01T16:00:00Z');
const spring = getTerm('2026-03-01T16:00:00Z');
const now = '2026-11-10T16:00:00Z';

const checkIns = (orgId: string, ...times: string[]): MyCheckIn[] =>
  times.map((startTime) => ({ orgId, startTime }));

describe('semesterProfile', () => {
  it('counts only the chosen semester', () => {
    const rows = [
      ...checkIns('org-acm', '2026-09-01T22:00:00Z', '2026-10-01T22:00:00Z'),
      ...checkIns('org-acm', '2026-02-01T22:00:00Z'),
    ];
    expect(semesterProfile([acm], rows, fall, now).orgs).toEqual([{ org: acm.organization, count: 2 }]);
    expect(semesterProfile([acm], rows, spring, now).orgs).toEqual([{ org: acm.organization, count: 1 }]);
  });

  it('files a meeting by the org calendar, not UTC', () => {
    // 11:30pm on 31 July in Gainesville is Summer, though it is already August in UTC.
    const rows = checkIns('org-acm', '2026-08-01T03:30:00Z');
    expect(semesterProfile([acm], rows, fall, now).orgs[0].count).toBe(0);
  });

  it('gives badges only to orgs with a threshold', () => {
    const { orgs, badges } = semesterProfile([acm, wece], checkIns('org-wece', '2026-09-01T22:00:00Z'), fall, now);
    expect(orgs.map((o) => o.org.slug)).toEqual(['wece', 'acm']);
    expect(badges).toEqual([{ org: acm.organization, count: 0, threshold: 3, earned: false }]);
  });

  it('earns the badge at the threshold', () => {
    const rows = checkIns('org-acm', '2026-09-01T22:00:00Z', '2026-09-08T22:00:00Z', '2026-09-15T22:00:00Z');
    expect(semesterProfile([acm], rows, fall, now).badges[0]).toMatchObject({ count: 3, earned: true });
  });

  it('puts earned badges first, then the rest by most check-ins', () => {
    const ieee = membership('org-ieee', 'ieee', 'IEEE');
    const shpe = membership('org-shpe', 'shpe', 'SHPE');
    const rows = [
      ...checkIns('org-acm', '2026-09-01T22:00:00Z', '2026-09-08T22:00:00Z'),
      ...checkIns('org-ieee', '2026-09-01T22:00:00Z'),
      ...checkIns('org-shpe', '2026-09-01T22:00:00Z', '2026-09-08T22:00:00Z'),
    ];
    const { badges, summary } = semesterProfile([acm, ieee, shpe], rows, fall, now);
    expect(badges.map((b) => [b.org.slug, b.earned])).toEqual([
      ['shpe', true],
      ['acm', false],
      ['ieee', false],
    ]);
    expect(summary).toBe('1 earned · 2 in progress');
  });

  it('says in progress until the semester ends, then not earned', () => {
    expect(semesterProfile([acm], [], fall, now)).toMatchObject({ ended: false, summary: '0 earned · 1 in progress' });
    expect(semesterProfile([acm], [], spring, now)).toMatchObject({ ended: true, summary: '0 earned · 1 not earned' });
    const nextSpring = getTerm('2027-03-01T16:00:00Z');
    expect(semesterProfile([acm], [], nextSpring, now)).toMatchObject({ ended: false });
  });
});

describe('eventCount', () => {
  it('pluralises', () => {
    expect(eventCount(0)).toBe('0 events');
    expect(eventCount(1)).toBe('1 event');
    expect(eventCount(4)).toBe('4 events');
  });
});

describe('orgActivity', () => {
  it('counts every check-in with the org and finds the latest', () => {
    const rows = [
      ...checkIns('org-acm', '2026-09-01T22:00:00Z', '2026-10-01T22:00:00Z', '2026-02-01T22:00:00Z'),
      ...checkIns('org-wece', '2026-11-01T22:00:00Z'),
    ];
    expect(orgActivity(rows, 'org-acm')).toEqual({ allTime: 3, last: rows[1] });
  });

  it('is empty for an org you have not checked in with', () => {
    expect(orgActivity([], 'org-acm')).toEqual({ allTime: 0, last: null });
  });
});

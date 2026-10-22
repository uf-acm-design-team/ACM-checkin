import { colors } from '@/theme';

import { membershipProgress, orgAccent, roleLabel } from './org-display';

describe('orgAccent', () => {
  it('reads the accent colour from branding', () => {
    expect(orgAccent({ colors: { accent: colors.bad, primary: colors.accent } })).toBe(colors.bad);
  });

  it('falls back to the primary colour', () => {
    expect(orgAccent({ colors: { primary: colors.accent } })).toBe(colors.accent);
  });

  it('ignores missing or invalid branding', () => {
    expect(orgAccent(null)).toBeNull();
    expect(orgAccent({})).toBeNull();
    expect(orgAccent({ colors: { accent: 'orange' } })).toBeNull();
  });
});

describe('membershipProgress', () => {
  it('counts down to the threshold', () => {
    expect(membershipProgress('acm', 1, 'pending')).toEqual({ threshold: 3, attended: 1, remaining: 2, isMember: false });
  });

  it('marks you a member once you reach it', () => {
    expect(membershipProgress('ACM', 4, 'pending')).toMatchObject({ remaining: 0, isMember: true });
  });

  it('treats an active member with only 1 check-in as a member', () => {
    expect(membershipProgress('acm', 1, 'active')).toMatchObject({ threshold: 3, isMember: true });
  });

  it('treats an active member of an org without a threshold as a member', () => {
    expect(membershipProgress('colorstack', 0, 'active')).toMatchObject({ threshold: null, isMember: true });
  });

  it('never makes you a member from check-ins alone when the org has no threshold', () => {
    expect(membershipProgress('colorstack', 5, 'pending')).toMatchObject({ threshold: null, isMember: false });
    expect(membershipProgress(null, 5, null)).toMatchObject({ threshold: null, isMember: false });
  });
});

describe('roleLabel', () => {
  it('capitalises roles', () => {
    expect(roleLabel('officer')).toBe('Officer');
    expect(roleLabel('co-owner')).toBe('Co-Owner');
  });
});

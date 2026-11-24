// Plain hex strings to stand in for an org's branding; the adaptive colours aren't strings on iOS.
import { lightColors as colors } from '@/theme';

import { membershipProgress, orgAccent, roleLabel, tint } from './org-display';

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

  it('gives every org the same threshold, so a new org gets progress and badges too', () => {
    expect(membershipProgress('colorstack', 2, 'pending')).toMatchObject({ threshold: 3, remaining: 1, isMember: false });
    expect(membershipProgress('colorstack', 3, 'pending')).toMatchObject({ threshold: 3, isMember: true });
    expect(membershipProgress('colorstack', 0, 'active')).toMatchObject({ threshold: 3, isMember: true });
  });

  it('has no threshold without a slug', () => {
    expect(membershipProgress(null, 5, null)).toMatchObject({ threshold: null, isMember: false });
  });
});

describe('roleLabel', () => {
  it('capitalises roles', () => {
    expect(roleLabel('officer')).toBe('Officer');
    expect(roleLabel('co-owner')).toBe('Co-Owner');
  });
});

describe('tint', () => {
  it('adds an alpha byte to the colour', () => {
    expect(tint(colors.accent, 0.14)).toBe(`${colors.accent}24`);
    expect(tint(colors.accent, 1)).toBe(`${colors.accent}ff`);
    expect(tint(colors.accent, 0)).toBe(`${colors.accent}00`);
  });
});

import type { Json } from '@/lib/supabase';

const MEMBERSHIP_THRESHOLDS: Record<string, number> = {
  acm: 3,
};

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function orgAccent(branding: Json | null): string | null {
  if (!branding || typeof branding !== 'object' || Array.isArray(branding)) return null;
  const palette = branding.colors;
  if (!palette || typeof palette !== 'object' || Array.isArray(palette)) return null;
  const accent = palette.accent ?? palette.primary;
  return typeof accent === 'string' && HEX_COLOR.test(accent) ? accent : null;
}

export type MembershipProgress = {
  threshold: number | null;
  attended: number;
  remaining: number;
  isMember: boolean;
};

export function membershipProgress(
  slug: string | null,
  attended: number,
  status: string | null,
): MembershipProgress {
  const threshold = slug ? (MEMBERSHIP_THRESHOLDS[slug.toLowerCase()] ?? null) : null;
  const meetsThreshold = threshold !== null && attended >= threshold;
  const isMember = status === 'active' || meetsThreshold;
  const remaining = threshold === null ? 0 : Math.max(threshold - attended, 0);
  return { threshold, attended, remaining, isMember };
}

export function roleLabel(role: string): string {
  return role
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('-');
}

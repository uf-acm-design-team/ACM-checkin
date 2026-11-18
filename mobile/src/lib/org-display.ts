import { resolveMembership } from '@shared/membership';

import type { Json } from '@/lib/supabase';
import { ORG_TIME_ZONE } from '@/lib/terms';

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
  // No slug means no configured org, which the shared rules treat as "no threshold".
  const { threshold, isMember, remaining } = resolveMembership(null, status, attended, slug ?? '');
  return { threshold, attended, remaining, isMember };
}

export function roleLabel(role: string): string {
  return role
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('-');
}

/** "Wed, Nov 25 · 6:00 PM" in the org's time zone, for the next meeting on Home. */
export function meetingWhen(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('en-US', { timeZone: ORG_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString('en-US', { timeZone: ORG_TIME_ZONE, hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

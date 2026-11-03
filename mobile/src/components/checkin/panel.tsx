import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, space } from '@/theme';

export type Tone = 'plain' | 'good' | 'warn' | 'bad';

/**
 * A card on the check-in screen. good / warn / bad tint it for a result.
 * A toned panel is announced as an alert, since it appears in reply to a tap.
 */
export function Panel({ tone = 'plain', title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <View accessibilityRole={tone === 'plain' ? undefined : 'alert'} style={[styles.panel, toneStyles[tone]]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

/** Body copy inside a panel. */
export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

/** Small uppercase label above a group ("Check in to", "2 questions"). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

/** A small neutral tag, e.g. "Password" on a meeting card. */
export function Chip({ label }: { label: string }) {
  return <Text style={styles.chip}>{label}</Text>;
}

const styles = StyleSheet.create({
  panel: {
    gap: space[3],
    padding: space[5],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
  },
  good: {
    backgroundColor: colors.goodSurface,
    borderColor: colors.goodLine,
  },
  warn: {
    backgroundColor: colors.warnSurface,
    borderColor: colors.warnLine,
  },
  bad: {
    backgroundColor: colors.badSurface,
    borderColor: colors.badLine,
  },
  title: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  muted: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  eyebrow: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: space[2],
    paddingVertical: 2,
    overflow: 'hidden',
    color: colors.inkStrong,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.pill,
    fontSize: 12,
    fontWeight: '600',
  },
});

const toneStyles = { plain: undefined, good: styles.good, warn: styles.warn, bad: styles.bad };

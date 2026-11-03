import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, shadows, space } from '@/theme';

/**
 * Full-screen canvas with safe-area padding. Every screen renders inside one.
 * `transparent` drops the canvas colour, for content layered over a camera.
 */
export function Screen({ children, transparent = false }: { children: ReactNode; transparent?: boolean }) {
  return (
    <SafeAreaView style={[styles.screen, transparent && styles.transparent]} edges={['top', 'left', 'right']}>
      {children}
    </SafeAreaView>
  );
}

/**
 * Stand-in for a screen that a later ticket builds. Says what will live here
 * and which ticket owns it, so nobody mistakes the shell for a finished screen.
 */
export function PlaceholderScreen({
  title,
  description,
  ticket,
  children,
}: {
  title: string;
  description: string;
  ticket?: string;
  children?: ReactNode;
}) {
  return (
    <Screen>
      <View style={styles.body}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          {ticket ? <Text style={styles.ticket}>{ticket}</Text> : null}
          {children}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  transparent: {
    backgroundColor: 'transparent',
  },
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    padding: space[4],
  },
  card: {
    gap: space[2],
    padding: space[5],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
    ...shadows.card,
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  description: {
    color: colors.inkMuted,
    fontSize: 15,
    lineHeight: 21,
  },
  ticket: {
    alignSelf: 'flex-start',
    marginTop: space[1],
    paddingHorizontal: space[2],
    paddingVertical: 2,
    overflow: 'hidden',
    color: colors.accentOnSoft,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    fontSize: 12,
    fontWeight: '600',
  },
});

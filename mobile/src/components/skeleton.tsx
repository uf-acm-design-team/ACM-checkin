import { useEffect, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, useAnimatedValue, View, type DimensionValue } from 'react-native';

import { useReducedMotion } from '@/lib/reduced-motion';
import { colors, radii, space } from '@/theme';

/**
 * Grey boxes in the shape of what's loading, gently pulsing, so a screen keeps
 * its layout while the data comes in. The real content then fades in over the
 * same spots (FadeIn). With Reduce Motion on the boxes stay still.
 *
 * `label` is what a screen reader says ("Loading your orgs").
 */
export function Skeleton({ label, children }: { label: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  const pulse = useAnimatedValue(1);

  useEffect(() => {
    if (reduced) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);

  return (
    <Animated.View
      style={[styles.group, { opacity: pulse }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      {children}
    </Animated.View>
  );
}

/** One grey box. */
export function Bone({
  width = '100%',
  height,
  round = false,
}: {
  width?: DimensionValue;
  height: number;
  round?: boolean;
}) {
  return <View style={[styles.bone, { width, height }, round && { borderRadius: height / 2 }]} />;
}

/** A Home org card: crest, name and count, then Up next and the progress bar. */
export function OrgCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Bone width={40} height={40} />
        <View style={styles.stack}>
          <Bone width="45%" height={16} />
          <Bone width="30%" height={12} />
        </View>
        <Bone width={64} height={24} round />
      </View>
      <View style={styles.stack}>
        <Bone width="20%" height={10} />
        <Bone width="60%" height={14} />
        <Bone width="40%" height={12} />
      </View>
      <Bone height={6} round />
    </View>
  );
}

/** A month calendar: the month row, weekdays and five weeks of days. */
export function CalendarSkeleton() {
  return (
    <View style={styles.card}>
      <View style={[styles.row, styles.spread]}>
        <Bone width={20} height={20} round />
        <Bone width="40%" height={16} />
        <Bone width={20} height={20} round />
      </View>
      {Array.from({ length: 5 }, (_, week) => (
        <View key={week} style={[styles.row, styles.spread]}>
          {Array.from({ length: 7 }, (_, day) => (
            <Bone key={day} width={32} height={32} round />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        <Bone width="25%" height={12} />
        <Bone width="20%" height={12} />
        <Bone width="22%" height={12} />
      </View>
    </View>
  );
}

/** A list of `count` rows with a square, a title and a line under it. */
export function RowsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.card}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.row}>
          <Bone width={30} height={30} />
          <View style={styles.stack}>
            <Bone width="55%" height={14} />
            <Bone width="35%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Profile's semester badges: a row of circles with a name under each. */
export function BadgesSkeleton() {
  return (
    <View style={[styles.row, styles.spread]}>
      {Array.from({ length: 4 }, (_, index) => (
        <View key={index} style={styles.badge}>
          <Bone width={56} height={56} round />
          <Bone width={48} height={12} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[3] },
  bone: { backgroundColor: colors.surfaceSunken, borderRadius: radii.control },
  card: {
    gap: space[4],
    padding: space[4],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  spread: { justifyContent: 'space-between' },
  stack: { flex: 1, gap: space[2] },
  badge: { alignItems: 'center', gap: space[2] },
});

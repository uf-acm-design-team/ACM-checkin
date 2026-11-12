import { useEffect } from 'react';
import { Animated, Easing, StyleSheet, Text, useAnimatedValue, View } from 'react-native';

import { useReducedMotion } from '@/lib/reduced-motion';
import { colors, radii, space } from '@/theme';

const DOT = 8;

/**
 * "Live", with a red dot that pulses, for a meeting that is open right now.
 * The word carries the meaning; the pulse is decoration, and stops when the
 * phone has Reduce Motion on. `solid` is for sitting on the accent colour.
 */
export function LivePill({ solid = false }: { solid?: boolean }) {
  const reduced = useReducedMotion();
  const pulse = useAnimatedValue(0);

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);

  return (
    <View style={[styles.pill, solid && styles.solid]} accessibilityLabel="Live now">
      <View style={styles.dot}>
        {reduced ? null : (
          <Animated.View
            style={[
              styles.ring,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
              },
            ]}
          />
        )}
      </View>
      <Text style={styles.text}>Live</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2] - 2,
    paddingLeft: space[2],
    paddingRight: space[2] + 2,
    paddingVertical: 3,
    backgroundColor: colors.badSurface,
    borderRadius: radii.pill,
  },
  solid: {
    backgroundColor: colors.surface,
  },
  dot: {
    width: DOT,
    height: DOT,
    backgroundColor: colors.bad,
    borderRadius: DOT / 2,
  },
  ring: {
    width: DOT,
    height: DOT,
    backgroundColor: colors.bad,
    borderRadius: DOT / 2,
  },
  text: {
    color: colors.badInk,
    fontSize: 12,
    fontWeight: '600',
  },
});

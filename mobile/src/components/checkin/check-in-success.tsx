import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Animated, Easing, StyleSheet, Text, useAnimatedValue, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { Button } from '@/components/button';
import { haptic } from '@/lib/haptics';
import { useReducedMotion } from '@/lib/reduced-motion';
import { colors, lightColors, radii, space } from '@/theme';

const timeFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

// The badge: a ring and a check mark, each drawn as one stroke so it can be
// revealed along its length (dash = the whole length, offset shrinks to 0).
const RING_SIZE = 72;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const CHECK_PATH = 'M22 37 L32 47 L51 27';
const CHECK_LENGTH = 42; // 14.1 + 27.6, the two strokes of CHECK_PATH

export type MembershipCount = { attended: number; threshold: number };

/** "One more to become a member", or where a member who has reached the threshold stands. */
export function membershipLine({ attended, threshold }: MembershipCount): string {
  const remaining = threshold - attended;
  if (remaining === 1) return 'One more to become a member';
  if (remaining > 1) return `${remaining} more to become a member`;
  return remaining === 0 ? 'You’re now a member!' : 'You’re a member';
}

/**
 * The "you're in" screen (AC-22), shown in place of the form once
 * member-check-in replies ok. A repeat check-in gets the same screen with its
 * own wording, since the server treats it as a success, not an error.
 *
 * `membership` is only sent for a new check-in at an org with a threshold, and
 * `checkedInAt` is this phone's clock when the reply arrived (the reply carries
 * no timestamp), so a repeat check-in shows neither.
 */
export function CheckInSuccess({
  orgName,
  meetingTitle,
  alreadyCheckedIn,
  checkedInAt,
  membership,
  onDone,
}: {
  orgName: string;
  meetingTitle: string;
  alreadyCheckedIn: boolean;
  checkedInAt: Date;
  membership: MembershipCount | null;
  onDone: () => void;
}) {
  const reached = membership ? membership.attended >= membership.threshold : false;

  // Purple floods out from the middle of the screen, the ring closes, the
  // check mark draws, then the words come up. Runs once, when the reply lands.
  const { width, height } = useWindowDimensions();
  const floodSize = Math.hypot(width, height);
  const flood = useAnimatedValue(0);
  const ring = useAnimatedValue(0);
  const check = useAnimatedValue(0);
  const words = useAnimatedValue(0);

  // With Reduce Motion on, show the finished screen straight away.
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      for (const value of [flood, ring, check, words]) value.setValue(1);
      haptic.success();
      return;
    }
    // The success buzz lands as the check mark finishes drawing.
    const buzz = setTimeout(haptic.success, 450 + 450 + 250);
    const ease = Easing.out(Easing.cubic);
    const animation = Animated.sequence([
      Animated.timing(flood, { toValue: 1, duration: 450, easing: ease, useNativeDriver: true }),
      // Stroke offsets are SVG props, which the native driver can't animate.
      Animated.timing(ring, { toValue: 1, duration: 450, easing: ease, useNativeDriver: false }),
      Animated.timing(check, { toValue: 1, duration: 250, easing: ease, useNativeDriver: false }),
      Animated.timing(words, { toValue: 1, duration: 300, easing: ease, useNativeDriver: true }),
    ]);
    animation.start();
    return () => {
      clearTimeout(buzz);
      animation.stop();
    };
  }, [reduced, flood, ring, check, words]);

  const wordsStyle = {
    opacity: words,
    transform: [{ translateY: words.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <Animated.View
        style={[
          styles.flood,
          {
            width: floodSize,
            height: floodSize,
            left: (width - floodSize) / 2,
            top: (height - floodSize) / 2,
            borderRadius: floodSize / 2,
            transform: [{ scale: flood }],
          },
        ]}
      />
      <View style={styles.hero}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ring}>
          <AnimatedCircle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            // Start the stroke at 12 o'clock rather than 3.
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            fill="none"
            stroke={colors.accentInk}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={ring.interpolate({ inputRange: [0, 1], outputRange: [RING_LENGTH, 0] })}
            opacity={ring.interpolate({ inputRange: [0, 0.01], outputRange: [0, 1], extrapolate: 'clamp' })}
          />
          <AnimatedPath
            d={CHECK_PATH}
            fill="none"
            stroke={colors.accentInk}
            strokeWidth={RING_STROKE + 1}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={CHECK_LENGTH}
            strokeDashoffset={check.interpolate({ inputRange: [0, 1], outputRange: [CHECK_LENGTH, 0] })}
            opacity={check.interpolate({ inputRange: [0, 0.01], outputRange: [0, 1], extrapolate: 'clamp' })}
          />
        </Svg>
      </View>
      <Animated.View style={[styles.words, wordsStyle]} accessibilityRole="alert">
        <Text style={styles.title}>{alreadyCheckedIn ? 'You’re already checked in' : 'You’re in'}</Text>
        <Text style={styles.meeting}>{meetingTitle}</Text>
        <Text style={styles.detail}>
          {alreadyCheckedIn ? orgName : `${orgName} · ${timeFormat.format(checkedInAt)}`}
        </Text>
        {alreadyCheckedIn ? <Text style={styles.detail}>Your check-in was recorded earlier. You’re all set.</Text> : null}
      </Animated.View>

      {membership ? (
        <Animated.View style={[styles.progress, wordsStyle]}>
          <Text style={styles.progressTitle}>
            {reached
              ? `${membership.attended} check-ins`
              : `${membership.attended} of ${membership.threshold} toward membership`}
          </Text>
          <View style={styles.track}>
            <View
              style={[styles.fill, { width: `${Math.min(membership.attended / membership.threshold, 1) * 100}%` }]}
            />
          </View>
          <Text style={styles.progressLine}>{membershipLine(membership)}</Text>
        </Animated.View>
      ) : null}

      <View style={styles.spacer} />
      <Animated.View style={{ opacity: words }}>
        <Button label="Back to Home" variant="secondary" onPress={onDone} />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: space[5],
    overflow: 'hidden',
    backgroundColor: colors.canvas,
  },
  flood: {
    position: 'absolute',
    backgroundColor: colors.accentDeep,
  },
  hero: {
    alignItems: 'center',
    marginTop: space[10],
  },
  ring: {
    marginBottom: space[4],
  },
  words: {
    alignItems: 'center',
    gap: space[2],
  },
  title: {
    color: colors.accentInk,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  meeting: {
    color: colors.accentInk,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  detail: {
    color: lightColors.accentSoft,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  progress: {
    gap: space[2],
    marginTop: space[8],
    padding: space[4],
    backgroundColor: colors.accent,
    borderRadius: radii.card,
  },
  progressTitle: {
    color: colors.accentInk,
    fontSize: 15,
    fontWeight: '600',
  },
  track: {
    height: 8,
    overflow: 'hidden',
    backgroundColor: colors.accentDeep,
    borderRadius: radii.pill,
  },
  fill: {
    height: 8,
    backgroundColor: colors.accentInk,
    borderRadius: radii.pill,
  },
  progressLine: {
    color: lightColors.accentSoft,
    fontSize: 13,
  },
  spacer: { flex: 1 },
});

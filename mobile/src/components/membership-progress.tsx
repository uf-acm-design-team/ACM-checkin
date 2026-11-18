import { StyleSheet, Text, View } from 'react-native';

import type { MembershipProgress as Progress } from '@/lib/org-display';
import { colors, radii, space } from '@/theme';

type Props = {
  progress: Progress;
  accent: string;
};

// The membership bar from the Home org card, as its own card. Shows nothing
// for an org with no attendance-based membership rule.
export function MembershipProgress({ progress, accent }: Props) {
  if (!progress.isMember && progress.threshold === null) return null;

  const ratio =
    progress.isMember || progress.threshold === null
      ? 1
      : Math.min(progress.attended / progress.threshold, 1);
  const checkIns = (n: number) => `${n} more ${n === 1 ? 'check-in' : 'check-ins'}`;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>Membership</Text>
        {progress.threshold !== null ? (
          <Text style={styles.count}>
            {Math.min(progress.attended, progress.threshold)} of {progress.threshold}
          </Text>
        ) : null}
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { backgroundColor: progress.isMember ? colors.good : accent, width: `${ratio * 100}%` },
          ]}
        />
      </View>
      <Text style={[styles.caption, progress.isMember && styles.memberText]}>
        {progress.isMember
          ? "You're a member"
          : `${checkIns(progress.remaining)} to become a member`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[2],
    padding: space[4],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  count: {
    color: colors.inkMuted,
    fontSize: 14,
  },
  track: {
    height: 6,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.pill,
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  caption: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  memberText: {
    color: colors.goodInk,
    fontWeight: '600',
  },
});

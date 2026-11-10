import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { orgAccent } from '@/lib/org-display';
import { eventCount, type ProfileBadge as Badge } from '@/lib/profile-badges';
import { colors, radii, space } from '@/theme';

type Props = {
  badge: Badge;
  // Unearned badges show a progress bar only while their semester is still running.
  inProgress: boolean;
  onPress: () => void;
};

// One org's semester badge: filled with the org's colour once earned, greyed out until then.
export function ProfileBadge({ badge, inProgress, onPress }: Props) {
  const { org, count, threshold, earned } = badge;
  const accent = orgAccent(org.branding) ?? colors.accent;
  const name = org.name ?? org.slug ?? 'Org';
  const caption = earned ? eventCount(count) : `${count} of ${threshold}`;

  return (
    <Pressable
      style={styles.badge}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Opens badge details"
      accessibilityLabel={`${name}: ${earned ? `earned, ${caption}` : `not earned, ${caption}`}`}
    >
      <View style={[styles.circle, earned ? { backgroundColor: accent } : styles.circleGrey]}>
        <Ionicons name="ribbon" size={26} color={earned ? colors.accentInk : colors.inkFaint} />
      </View>
      <Text style={[styles.name, !earned && styles.nameMuted]} numberOfLines={1} ellipsizeMode="tail">
        {name}
      </Text>
      {!earned && inProgress ? (
        <View style={styles.track} testID={`badge-progress-${org.id}`}>
          <View
            style={[
              styles.fill,
              { width: `${Math.min(count / threshold, 1) * 100}%`, backgroundColor: accent },
            ]}
          />
        </View>
      ) : null}
      <Text style={styles.caption}>{caption}</Text>
    </Pressable>
  );
}

export function ProfileBadgeDetails({
  badge,
  semester,
  ended,
  onClose,
}: {
  badge: Badge | null;
  semester: string;
  ended: boolean;
  onClose: () => void;
}) {
  return (
    <BottomSheet onClose={onClose} backdropLabel="Dismiss badge details" style={styles.sheet}>
      {badge ? (dismiss) => (
        <ScrollView contentContainerStyle={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <View style={[styles.circle, badge.earned
              ? { backgroundColor: orgAccent(badge.org.branding) ?? colors.accent }
              : styles.circleGrey]}>
              <Ionicons
                name="ribbon"
                size={26}
                color={badge.earned ? colors.accentInk : colors.inkFaint}
              />
            </View>
            <Pressable onPress={dismiss} accessibilityRole="button" hitSlop={8} style={styles.close}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            {badge.org.name ?? badge.org.slug ?? 'Org'} semester badge
          </Text>
          <Text style={styles.body}>{semester}</Text>
          <Text style={[styles.status, badge.earned && styles.earned]}>
            {badge.earned ? 'Earned' : ended ? 'Not earned' : 'In progress'}
          </Text>
          <Text style={styles.body}>
            Earn this badge by checking in to {eventCount(badge.threshold)} hosted by this org during the semester.
          </Text>
          <Text style={styles.progressLabel}>
            {Math.min(badge.count, badge.threshold)} of {badge.threshold} required check-ins
          </Text>
          {badge.earned || !ended ? (
            <View
              style={[styles.track, styles.sheetTrack]}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Badge progress"
              accessibilityValue={{ min: 0, max: badge.threshold, now: Math.min(badge.count, badge.threshold) }}
            >
              <View style={[styles.fill, {
                backgroundColor: orgAccent(badge.org.branding) ?? colors.accent,
                width: `${Math.min(badge.count / badge.threshold, 1) * 100}%`,
              }]} />
            </View>
          ) : null}
          <Text style={styles.body}>
            {badge.earned || ended
              ? `${eventCount(badge.count)} this semester`
              : `${badge.threshold - badge.count} more ${badge.threshold - badge.count === 1 ? 'event' : 'events'} to earn this badge`}
          </Text>
        </ScrollView>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.panel,
    borderTopRightRadius: radii.panel,
  },
  sheetContent: { padding: space[5], paddingBottom: space[8], gap: space[2] },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space[2] },
  closeText: { color: colors.accentOnSoft, fontWeight: '600' },
  title: { color: colors.ink, fontSize: 22, fontWeight: '700' },
  body: { color: colors.inkMuted, fontSize: 14 },
  status: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    color: colors.accentOnSoft,
    borderRadius: radii.pill,
    overflow: 'hidden',
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    fontWeight: '600',
  },
  earned: { backgroundColor: colors.goodSurface, color: colors.goodInk },
  progressLabel: { color: colors.ink, fontWeight: '600', marginTop: space[1] },
  sheetTrack: { width: '100%', height: 6 },
  badge: {
    width: 76,
    alignItems: 'center',
    gap: space[1],
  },
  circle: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  circleGrey: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
  },
  name: {
    maxWidth: '100%',
    marginTop: space[1],
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  nameMuted: {
    color: colors.inkMuted,
  },
  track: {
    width: 48,
    height: 4,
    overflow: 'hidden',
    backgroundColor: colors.line,
    borderRadius: radii.pill,
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  caption: {
    color: colors.inkFaint,
    fontSize: 12,
  },
});

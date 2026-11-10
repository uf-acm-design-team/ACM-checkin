import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { orgAccent } from '@/lib/org-display';
import { eventCount, type ProfileBadge as Badge } from '@/lib/profile-badges';
import { colors, radii, space } from '@/theme';

type Props = {
  badge: Badge;
  // Unearned badges show a progress bar only while their semester is still running.
  inProgress: boolean;
};

// One org's semester badge: filled with the org's colour once earned, greyed out until then.
export function ProfileBadge({ badge, inProgress }: Props) {
  const { org, count, threshold, earned } = badge;
  const accent = orgAccent(org.branding) ?? colors.accent;
  const name = org.name ?? org.slug ?? 'Org';
  const caption = earned ? eventCount(count) : `${count} of ${threshold}`;

  return (
    <View
      style={styles.badge}
      accessible
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
    </View>
  );
}

const styles = StyleSheet.create({
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

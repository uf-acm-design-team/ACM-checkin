import { StyleSheet, Text, View } from 'react-native';

import { membershipProgress, orgAccent, roleLabel } from '@/lib/org-display';
import type { HomeOrg } from '@/lib/supabase';
import { colors, radii, shadows, space } from '@/theme';

export function OrgCard({ org, role, status, attended }: HomeOrg) {
  const name = org.name ?? org.slug ?? 'Organization';
  const accent = orgAccent(org.branding) ?? colors.accent;
  const progress = membershipProgress(org.slug, attended, status);
  const showProgress = progress.isMember || progress.threshold !== null;
  const fillRatio = progress.isMember || progress.threshold === null ? 1 : Math.min(attended / progress.threshold, 1);
  const checkIns = `${attended} ${attended === 1 ? 'check-in' : 'check-ins'}`;

  return (
    <View style={styles.card} accessibilityLabel={`${name}, ${roleLabel(role)}, ${checkIns}`}>
      <View style={styles.header}>
        <View style={[styles.crest, { backgroundColor: accent }]}>
          <Text style={styles.crestLetter}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.count}>{checkIns}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{roleLabel(role)}</Text>
        </View>
      </View>

      {showProgress ? (
        <View style={styles.progressBlock}>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: progress.isMember ? colors.good : accent,
                  width: `${fillRatio * 100}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, progress.isMember && styles.memberText]}>
            {progress.isMember
              ? "You're a member"
              : `${progress.remaining} more ${progress.remaining === 1 ? 'check-in' : 'check-ins'} to become a member`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[3],
    padding: space[4],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
    ...shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  crest: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.card,
  },
  crestLetter: {
    color: colors.accentInk,
    fontSize: 18,
    fontWeight: '700',
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  count: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  chip: {
    paddingHorizontal: space[2],
    paddingVertical: 2,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.pill,
  },
  chipText: {
    color: colors.inkStrong,
    fontSize: 12,
    fontWeight: '600',
  },
  progressBlock: {
    gap: space[1],
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
  progressText: {
    color: colors.inkMuted,
    fontSize: 12,
  },
  memberText: {
    color: colors.goodInk,
    fontWeight: '600',
  },
});

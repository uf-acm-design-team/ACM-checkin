import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { meetingWhen, membershipProgress, orgAccent, roleLabel } from '@/lib/org-display';
import type { HomeOrg } from '@/lib/supabase';
import { colors, radii, shadows, space } from '@/theme';

export function OrgCard({ org, role, status, attended, nextMeeting, checkedInToday }: HomeOrg) {
  const slug = org.slug;
  const name = org.name ?? slug ?? 'Organization';
  const accent = orgAccent(org.branding) ?? colors.accent;
  const progress = membershipProgress(org.slug, attended, status);
  const showProgress = progress.isMember || progress.threshold !== null;
  const fillRatio = progress.isMember || progress.threshold === null ? 1 : Math.min(attended / progress.threshold, 1);
  const checkIns = `${attended} ${attended === 1 ? 'check-in' : 'check-ins'}`;
  const next = nextMeeting ? `Next: ${nextMeeting.title}, ${meetingWhen(nextMeeting.startTime)}` : 'No upcoming meetings';
  const spoken = [name, roleLabel(role), checkIns, checkedInToday ? 'Checked in today' : null, next]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={slug ? () => router.push({ pathname: '/org/[orgSlug]', params: { orgSlug: slug } }) : undefined}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens your attendance history"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
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

      <View style={styles.nextRow}>
        <Ionicons name="calendar-outline" size={16} color={colors.inkMuted} />
        {nextMeeting ? (
          <View style={styles.nextText}>
            <Text style={styles.nextTitle} numberOfLines={1}>
              {nextMeeting.title}
            </Text>
            <Text style={styles.nextWhen}>{meetingWhen(nextMeeting.startTime)}</Text>
          </View>
        ) : (
          <Text style={[styles.nextText, styles.nextWhen]}>No upcoming meetings</Text>
        )}
        {checkedInToday ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Checked in ✓</Text>
          </View>
        ) : null}
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.85,
  },
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
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingTop: space[3],
    borderTopColor: colors.lineSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  nextText: {
    flex: 1,
    gap: 2,
  },
  nextTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  nextWhen: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  badge: {
    paddingHorizontal: space[2],
    paddingVertical: 2,
    backgroundColor: colors.goodSurface,
    borderColor: colors.goodLine,
    borderWidth: 1,
    borderRadius: radii.pill,
  },
  badgeText: {
    color: colors.goodInk,
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

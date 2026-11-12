import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { nextMeeting } from '@/lib/meeting-details';
import { membershipProgress, orgAccent } from '@/lib/org-display';
import { eventCount, type OrgActivity } from '@/lib/profile-badges';
import { getMyOrgMeetings, useSupabase, type MyMembership } from '@/lib/supabase';
import { getTerm, ORG_TIME_ZONE, termBounds } from '@/lib/terms';
import { colors, radii, space } from '@/theme';

const date = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString('en-US', { timeZone: ORG_TIME_ZONE, ...options });

type Next = { status: 'loading' } | { status: 'none' } | { status: 'found'; title: string; startTime: string };

/**
 * One org in Profile's "Your orgs" list. Tapping it opens the row in place to
 * show where you stand with that org: membership, your all-time count, the
 * last meeting you went to and the next one coming up.
 */
export function ProfileOrgRow({
  membership,
  count,
  activity,
  now,
  expanded,
  divider,
  onToggle,
}: {
  membership: MyMembership;
  // Check-ins in the semester the page is showing.
  count: number;
  activity: OrgActivity;
  now: string;
  expanded: boolean;
  divider: boolean;
  onToggle: () => void;
}) {
  const org = membership.organization;
  const name = org.name ?? org.slug ?? 'Organization';
  const accent = orgAccent(org.branding) ?? colors.accent;

  return (
    <View style={divider && styles.divider}>
      <Pressable
        onPress={() => {
          haptic.tick();
          onToggle();
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${name}, ${eventCount(count)}`}
        accessibilityHint={expanded ? 'Hides details' : 'Shows details'}
        style={styles.row}
      >
        <View style={[styles.crest, { backgroundColor: accent }]}>
          <Text style={styles.crestLetter}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.muted}>{eventCount(count)}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.inkFaint} />
      </Pressable>
      {expanded ? <Details membership={membership} activity={activity} accent={accent} now={now} /> : null}
    </View>
  );
}

function Details({
  membership,
  activity,
  accent,
  now,
}: {
  membership: MyMembership;
  activity: OrgActivity;
  accent: string;
  now: string;
}) {
  const supabase = useSupabase();
  const org = membership.organization;
  const progress = membershipProgress(org.slug, activity.allTime, membership.status);
  const [next, setNext] = useState<Next>({ status: 'loading' });

  // The next meeting isn't part of the profile load, so fetch it when the row opens.
  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    (async () => {
      let found: Next = { status: 'none' };
      try {
        const { meetings } = await getMyOrgMeetings(supabase, org.id, termBounds(getTerm(now)));
        const meeting = nextMeeting(meetings, new Set(), now);
        if (meeting) found = { status: 'found', title: meeting.title, startTime: meeting.startTime };
      } catch {
        // Leave it as "none": the rest of the details still stand.
      }
      if (!cancelled) setNext(found);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, org.id, now]);

  const slug = org.slug;
  const ratio =
    progress.isMember || progress.threshold === null ? 1 : Math.min(activity.allTime / progress.threshold, 1);

  return (
    <View style={styles.details}>
      <View style={styles.statusRow}>
        <Text style={[styles.pill, progress.isMember && styles.memberPill]}>
          {progress.isMember ? 'Member' : 'Not a member yet'}
        </Text>
        {membership.created_at ? (
          <Text style={styles.muted}>since {date(membership.created_at, { month: 'short', year: 'numeric' })}</Text>
        ) : null}
      </View>
      {progress.isMember || progress.threshold !== null ? (
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { backgroundColor: progress.isMember ? colors.good : accent, width: `${ratio * 100}%` },
            ]}
          />
        </View>
      ) : null}
      {!progress.isMember && progress.threshold !== null ? (
        <Text style={styles.muted}>
          {progress.remaining} more {progress.remaining === 1 ? 'check-in' : 'check-ins'} to become a member
        </Text>
      ) : null}
      <Text style={styles.muted}>{eventCount(activity.allTime)} all time</Text>
      <Text style={styles.muted}>
        Last attended ·{' '}
        {activity.last
          ? `${activity.last.title ?? 'Meeting'}, ${date(activity.last.startTime, { month: 'short', day: 'numeric' })}`
          : 'Nothing yet'}
      </Text>
      <Text style={styles.muted}>
        Next ·{' '}
        {next.status === 'loading'
          ? 'Loading…'
          : next.status === 'none'
            ? 'No upcoming meetings'
            : `${next.title}, ${date(next.startTime, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`}
      </Text>
      {slug ? (
        <Pressable
          onPress={() => router.push({ pathname: '/org/[orgSlug]', params: { orgSlug: slug } })}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.history}
        >
          <Text style={styles.historyText}>View history ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    borderTopColor: colors.lineSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  crest: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.card,
  },
  crestLetter: {
    color: colors.accentInk,
    fontSize: 14,
    fontWeight: '700',
  },
  name: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  muted: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  details: {
    gap: space[2],
    paddingHorizontal: space[4],
    paddingBottom: space[4],
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  pill: {
    paddingHorizontal: space[2],
    paddingVertical: 2,
    overflow: 'hidden',
    color: colors.inkStrong,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.pill,
    fontSize: 12,
    fontWeight: '600',
  },
  memberPill: {
    color: colors.goodInk,
    backgroundColor: colors.goodSurface,
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
  history: {
    alignSelf: 'flex-start',
  },
  historyText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
});

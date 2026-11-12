import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { FadeIn } from '@/components/fade-in';
import { GLASS_TAB_BAR_SPACE } from '@/components/glass-tab-bar';
import { LivePill } from '@/components/live-pill';
import { MeetingCalendar } from '@/components/meeting-calendar';
import { MeetingDetails } from '@/components/meeting-details';
import { ProfileButton } from '@/components/profile-button';
import { Screen } from '@/components/screen';
import { addMonths } from '@/lib/calendar';
import { daysAway } from '@/lib/meeting-details';
import { orgAccent } from '@/lib/org-display';
import {
  getLiveMeetings,
  getMyHomeOrgs,
  getMyOrgMeetings,
  useSupabase,
  type LiveMeeting,
  type OrgMeeting,
} from '@/lib/supabase';
import {
  academicYearTerms,
  getTerm,
  ORG_TIME_ZONE,
  orgDate,
  termBounds,
  termForMonth,
  type Term,
  type YearMonth,
} from '@/lib/terms';
import { colors, radii, space } from '@/theme';

// A meeting plus the org it belongs to, for the row under the calendar.
type AllMeeting = OrgMeeting & { orgName: string; accent: string };

type CalendarState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; meetings: AllMeeting[]; live: LiveMeeting[] };

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    timeZone: ORG_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/**
 * Calendar tab: every meeting across the orgs you've checked in with, on one
 * month grid. Same marks as an org's own calendar; the rows under it say which
 * org each meeting belongs to. Loads one semester at a time, like the org page.
 */
export default function AllMeetingsScreen() {
  const supabase = useSupabase();
  const [state, setState] = useState<CalendarState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const now = useMemo(() => new Date().toISOString(), []);
  const terms = useMemo(() => academicYearTerms(now), [now]);
  const [term, setTerm] = useState<Term>(() => getTerm(now));
  // Opens on this month with today picked.
  const [month, setMonth] = useState<YearMonth>(() => orgDate(now));
  const [selectedDay, setSelectedDay] = useState<number | null>(() => orgDate(now).day);
  const [detail, setDetail] = useState<AllMeeting | null>(null);

  // The arrows stop at the ends of this academic year.
  const canMove = (count: number) =>
    terms.some((t) => t.key === termForMonth(addMonths(month, count)).key);
  const moveMonth = (count: number) => {
    const next = addMonths(month, count);
    const nextTerm = termForMonth(next);
    if (!terms.some((t) => t.key === nextTerm.key)) return;
    setMonth(next);
    setSelectedDay(null);
    if (nextTerm.key !== term.key) setTerm(nextTerm);
  };

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    (async () => {
      let next: CalendarState;
      try {
        const orgs = await getMyHomeOrgs(supabase);
        const [perOrg, live] = await Promise.all([
          Promise.all(orgs.map(({ org }) => getMyOrgMeetings(supabase, org.id, termBounds(term)))),
          // The Live pill is an extra: if this fails, still show the calendar.
          getLiveMeetings(supabase, orgs.map(({ org }) => org.id)).catch(() => []),
        ]);
        next = {
          status: 'ready',
          meetings: perOrg.flatMap(({ meetings }, index) => {
            const { org } = orgs[index];
            const orgName = org.name ?? org.slug ?? 'Organization';
            const accent = orgAccent(org.branding) ?? colors.accent;
            return meetings.map((meeting) => ({ ...meeting, orgName, accent }));
          }),
          live,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Something went wrong.';
        next = { status: 'error', message };
      }
      if (!cancelled) {
        setState(next);
        setRefreshing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, term, reloadKey]);

  // Tabs stay mounted, so reload quietly on every return, as Home does.
  const hasFocused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (hasFocused.current) setReloadKey((key) => key + 1);
      hasFocused.current = true;
    }, []),
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((key) => key + 1);
  }, []);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  if (state.status === 'loading') {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.muted}>Loading your meetings…</Text>
        </View>
      </Screen>
    );
  }

  const meetings = state.status === 'ready' ? state.meetings : [];
  const liveIds = new Set((state.status === 'ready' ? state.live : []).map((meeting) => meeting.id));
  const dayMeetings =
    selectedDay === null
      ? []
      : meetings
          .filter((meeting) => {
            const date = orgDate(meeting.startTime);
            return date.year === month.year && date.month === month.month && date.day === selectedDay;
          })
          .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>All meetings</Text>
            <Text style={styles.muted}>Every org you&apos;ve checked in with</Text>
          </View>
          <ProfileButton />
        </View>

        {state.status === 'error' ? (
          <View style={[styles.panel, styles.errorPanel]}>
            <Text style={styles.panelTitle}>Couldn&apos;t load your meetings</Text>
            <Text style={styles.muted}>{state.message}</Text>
            <Button label="Try again" variant="secondary" onPress={retry} />
          </View>
        ) : (
          <>
            <MeetingCalendar
              month={month}
              meetings={meetings}
              now={now}
              canGoBack={canMove(-1)}
              canGoForward={canMove(1)}
              onMove={moveMonth}
              selectedDay={selectedDay}
              onSelectDay={(day) => setSelectedDay(day === selectedDay ? null : day)}
            />
            {dayMeetings.length > 0 ? (
              // Keyed by day so picking another day fades its rows in.
              <FadeIn key={`${month.year}-${month.month}-${selectedDay}`} style={styles.rows}>
                {dayMeetings.map((meeting) => {
                  const live = liveIds.has(meeting.id);
                  const upcoming =
                    !meeting.attended && new Date(meeting.startTime).getTime() > new Date(now).getTime();
                  return (
                    <Pressable
                      key={meeting.id}
                      onPress={() => setDetail(meeting)}
                      accessibilityRole="button"
                      accessibilityHint="Opens meeting details"
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    >
                      <View style={[styles.crest, { backgroundColor: meeting.accent }]}>
                        <Text style={styles.crestLetter}>{meeting.orgName.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {meeting.title}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {meeting.orgName} · {when(meeting.startTime)}
                        </Text>
                      </View>
                      {live ? <LivePill /> : null}
                      {meeting.attended ? (
                        <Ionicons name="checkmark" size={18} color={colors.good} accessibilityLabel="Checked in" />
                      ) : live ? null : upcoming ? (
                        <Text style={styles.badge}>{daysAway(meeting.startTime, now)}</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </FadeIn>
            ) : (
              <Text style={styles.muted}>
                {selectedDay === null ? 'Tap a day to see its meetings' : 'No meetings on this day'}
              </Text>
            )}
          </>
        )}
      </ScrollView>
      <MeetingDetails
        meeting={detail}
        orgName={detail?.orgName ?? ''}
        now={now}
        live={detail ? liveIds.has(detail.id) : false}
        onClose={() => setDetail(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
  content: {
    flexGrow: 1,
    gap: space[3],
    padding: space[4],
    paddingBottom: space[4] + GLASS_TAB_BAR_SPACE,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    marginBottom: space[1],
  },
  headerText: {
    flex: 1,
    gap: space[1],
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  rows: {
    gap: space[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[4],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
  },
  rowPressed: {
    backgroundColor: colors.surfaceSunken,
  },
  crest: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.card,
  },
  crestLetter: {
    color: colors.accentInk,
    fontSize: 16,
    fontWeight: '700',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  rowMeta: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  badge: {
    paddingHorizontal: space[2],
    paddingVertical: 2,
    overflow: 'hidden',
    color: colors.accentOnSoft,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    fontSize: 12,
    fontWeight: '600',
  },
  panel: {
    gap: space[2],
    padding: space[5],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
  },
  errorPanel: {
    backgroundColor: colors.badSurface,
    borderColor: colors.badLine,
  },
  panelTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  muted: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { MeetingCalendar } from '@/components/meeting-calendar';
import { MeetingDetails } from '@/components/meeting-details';
import { MembershipProgress } from '@/components/membership-progress';
import { Screen } from '@/components/screen';
import { SemesterPicker } from '@/components/semester-picker';
import { ViewSwitch } from '@/components/view-switch';
import { addMonths } from '@/lib/calendar';
import { daysAway } from '@/lib/meeting-details';
import { membershipProgress, orgAccent, type MembershipProgress as Progress } from '@/lib/org-display';
import { getMyHomeOrgs, getMyOrgMeetings, getOrgBySlug, useSupabase, type OrgMeeting } from '@/lib/supabase';
import {
  academicYearTerms,
  firstMonth,
  getTerm,
  orgDate,
  termBounds,
  termForMonth,
  type Term,
  type YearMonth,
} from '@/lib/terms';
import { colors, radii, space } from '@/theme';

const ORG_TIME_ZONE = 'America/New_York';

const VIEWS = [
  { value: 'list', label: 'List' },
  { value: 'calendar', label: 'Calendar' },
] as const;
type HistoryView = (typeof VIEWS)[number]['value'];

type HistoryState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      orgName: string;
      accent: string;
      progress: Progress;
      // Every meeting in the semester, attended or not, past or upcoming.
      meetings: OrgMeeting[];
    };

// The month the calendar opens on for a semester: this month if it's the
// current semester, otherwise the semester's first month.
function openingMonth(term: Term, now: string): YearMonth {
  const today = orgDate(now);
  return termForMonth(today).key === term.key ? today : firstMonth(term);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: ORG_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// One meeting in the list or under the calendar. Tapping it opens its details.
function MeetingRow({ meeting, now, onPress }: { meeting: OrgMeeting; now: string; onPress: () => void }) {
  const upcoming = !meeting.attended && new Date(meeting.startTime).getTime() > new Date(now).getTime();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Opens meeting details"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {meeting.title}
        </Text>
        <Text style={styles.muted}>{formatDate(meeting.startTime)}</Text>
      </View>
      {meeting.attended ? (
        <Ionicons name="checkmark" size={18} color={colors.good} accessibilityLabel="Checked in" />
      ) : upcoming ? (
        <Text style={styles.badge}>{daysAway(meeting.startTime, now)}</Text>
      ) : null}
    </Pressable>
  );
}

export default function OrgHistoryScreen() {
  const { orgSlug } = useLocalSearchParams<{ orgSlug: string }>();
  const supabase = useSupabase();
  const [state, setState] = useState<HistoryState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<HistoryView>('list');
  // Start on the current semester; the picker offers this academic year's three.
  const now = useMemo(() => new Date().toISOString(), []);
  const terms = useMemo(() => academicYearTerms(now), [now]);
  const [term, setTerm] = useState<Term>(() => getTerm(now));
  const [month, setMonth] = useState<YearMonth>(() => openingMonth(getTerm(now), now));
  // The calendar day whose meetings are listed under it, and the meeting open in the sheet.
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [detail, setDetail] = useState<OrgMeeting | null>(null);

  // Picking a semester moves the calendar to it.
  const selectTerm = useCallback(
    (next: Term) => {
      setTerm(next);
      setMonth(openingMonth(next, now));
      setSelectedDay(null);
    },
    [now],
  );

  // Paging the calendar into another semester switches the dropdown to it.
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
      let next: HistoryState;
      try {
        const org = await getOrgBySlug(supabase, orgSlug);
        if (!org) throw new Error('This org no longer exists.');
        const [{ meetings }, homeOrgs] = await Promise.all([
          getMyOrgMeetings(supabase, org.id, termBounds(term)),
          getMyHomeOrgs(supabase),
        ]);
        // Membership counts every check-in, not just this semester's -- the
        // same numbers as the org's card on Home.
        const home = homeOrgs.find((entry) => entry.org.id === org.id);
        next = {
          status: 'ready',
          orgName: org.name ?? org.slug ?? 'Organization',
          accent: orgAccent(org.branding) ?? colors.accent,
          progress: membershipProgress(org.slug, home?.attended ?? 0, home?.status ?? null),
          meetings,
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
  }, [supabase, orgSlug, term, reloadKey]);

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
          <Text style={styles.muted}>Loading your check-ins…</Text>
        </View>
      </Screen>
    );
  }

  const attended =
    state.status === 'ready' ? state.meetings.filter((meeting) => meeting.attended) : [];
  const dayMeetings =
    state.status === 'ready' && selectedDay !== null
      ? state.meetings.filter((meeting) => {
          const date = orgDate(meeting.startTime);
          return date.year === month.year && date.month === month.month && date.day === selectedDay;
        })
      : [];

  return (
    <Screen>
      <FlatList
        data={view === 'list' ? attended : []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.topBar}>
              <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.back}>‹ Back</Text>
              </Pressable>
              <SemesterPicker terms={terms} selected={term} onSelect={selectTerm} />
            </View>
            {state.status === 'ready' ? (
              <>
                <Text style={styles.title}>{state.orgName}</Text>
                <Text style={styles.muted}>
                  {attended.length} {attended.length === 1 ? 'check-in' : 'check-ins'} in {term.label}
                </Text>
                <View style={styles.progress}>
                  <MembershipProgress progress={state.progress} accent={state.accent} />
                </View>
                <ViewSwitch options={VIEWS} value={view} onChange={setView} />
              </>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <MeetingRow meeting={item} now={now} onPress={() => setDetail(item)} />}
        ListEmptyComponent={
          state.status === 'error' ? (
            <View style={[styles.panel, styles.errorPanel]}>
              <Text style={styles.panelTitle}>Couldn&apos;t load your check-ins</Text>
              <Text style={styles.muted}>{state.message}</Text>
              <Button label="Try again" variant="secondary" onPress={retry} />
            </View>
          ) : view === 'calendar' && state.status === 'ready' ? (
            <View style={styles.calendar}>
              <MeetingCalendar
                month={month}
                meetings={state.meetings}
                now={now}
                canGoBack={canMove(-1)}
                canGoForward={canMove(1)}
                onMove={moveMonth}
                selectedDay={selectedDay}
                onSelectDay={(day) => setSelectedDay(day === selectedDay ? null : day)}
              />
              {dayMeetings.length > 0 ? (
                dayMeetings.map((meeting) => (
                  <MeetingRow key={meeting.id} meeting={meeting} now={now} onPress={() => setDetail(meeting)} />
                ))
              ) : (
                <Text style={styles.muted}>Tap a day to see its meetings</Text>
              )}
            </View>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>No check-ins this term yet</Text>
              <Text style={styles.muted}>
                Scan the QR code at a meeting and it will show up here.
              </Text>
            </View>
          )
        }
      />
      {state.status === 'ready' ? (
        <MeetingDetails meeting={detail} orgName={state.orgName} now={now} onClose={() => setDetail(null)} />
      ) : null}
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
  list: {
    flexGrow: 1,
    padding: space[4],
  },
  header: {
    gap: space[1],
    marginBottom: space[4],
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space[2],
  },
  back: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  progress: {
    marginVertical: space[3],
  },
  separator: {
    height: space[2],
  },
  calendar: {
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
  rowText: {
    flex: 1,
    gap: space[1],
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
  rowTitle: {
    color: colors.ink,
    fontSize: 16,
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
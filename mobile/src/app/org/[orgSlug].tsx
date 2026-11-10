import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { getMyOrgMeetings, getOrgBySlug, useSupabase, type OrgMeeting } from '@/lib/supabase';
import { colors, radii, space } from '@/theme';

const ORG_TIME_ZONE = 'America/New_York';

type HistoryState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; orgName: string; meetings: OrgMeeting[]; total: number };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: ORG_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function OrgHistoryScreen() {
  const { orgSlug } = useLocalSearchParams<{ orgSlug: string }>();
  const supabase = useSupabase();
  const [state, setState] = useState<HistoryState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    (async () => {
      let next: HistoryState;
      try {
        const org = await getOrgBySlug(supabase, orgSlug);
        if (!org) throw new Error('This org no longer exists.');
        const { meetings } = await getMyOrgMeetings(supabase, org.id, {
          start: '2000-01-01T00:00:00Z',
          end: new Date().toISOString(),
        });
        const attended = meetings.filter((meeting) => meeting.attended);
        next = {
          status: 'ready',
          orgName: org.name ?? org.slug ?? 'Organization',
          meetings: attended,
          total: attended.length,
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
  }, [supabase, orgSlug, reloadKey]);

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

  return (
    <Screen>
      <FlatList
        data={state.status === 'ready' ? state.meetings : []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.back}>‹ Back</Text>
            </Pressable>
            {state.status === 'ready' ? (
              <>
                <Text style={styles.title}>{state.orgName}</Text>
                <Text style={styles.muted}>
                  {state.total} {state.total === 1 ? 'check-in' : 'check-ins'}
                </Text>
              </>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.muted}>{formatDate(item.startTime)}</Text>
          </View>
        )}
        ListEmptyComponent={
          state.status === 'error' ? (
            <View style={[styles.panel, styles.errorPanel]}>
              <Text style={styles.panelTitle}>Couldn&apos;t load your check-ins</Text>
              <Text style={styles.muted}>{state.message}</Text>
              <Button label="Try again" variant="secondary" onPress={retry} />
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
  back: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: space[2],
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  separator: {
    height: space[2],
  },
  row: {
    gap: space[1],
    padding: space[4],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
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
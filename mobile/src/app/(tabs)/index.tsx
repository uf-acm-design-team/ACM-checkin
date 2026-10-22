import { useUser } from '@clerk/expo';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { OrgCard } from '@/components/org-card';
import { Screen } from '@/components/screen';
import { getMyHomeOrgs, useSupabase, type HomeOrg } from '@/lib/supabase';
import { colors, radii, space } from '@/theme';

type HomeState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; orgs: HomeOrg[] };

export default function HomeScreen() {
  const { user } = useUser();
  const supabase = useSupabase();
  const [state, setState] = useState<HomeState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    (async () => {
      let next: HomeState;
      try {
        next = { status: 'ready', orgs: await getMyHomeOrgs(supabase) };
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
  }, [supabase, reloadKey]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((key) => key + 1);
  }, []);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  const greeting = user?.firstName ? `Hi, ${user.firstName}` : 'Hi there';

  if (state.status === 'loading') {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.muted}>Loading your orgs…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={state.status === 'ready' ? state.orgs : []}
        keyExtractor={(item) => item.org.id}
        renderItem={({ item }) => <OrgCard {...item} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.title}>Your orgs</Text>
          </View>
        }
        ListEmptyComponent={
          state.status === 'error' ? (
            <View style={[styles.panel, styles.errorPanel]}>
              <Text style={styles.panelTitle}>Couldn&apos;t load your orgs</Text>
              <Text style={styles.muted}>{state.message}</Text>
              <Button label="Try again" variant="secondary" onPress={retry} />
            </View>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>You haven&apos;t checked in anywhere yet</Text>
              <Text style={styles.muted}>
                Scan an org&apos;s QR code at a meeting and it will show up here.
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
  greeting: {
    color: colors.inkMuted,
    fontSize: 14,
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  separator: {
    height: space[3],
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

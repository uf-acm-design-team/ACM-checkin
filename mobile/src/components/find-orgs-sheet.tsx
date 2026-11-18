import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { orgAccent } from '@/lib/org-display';
import { searchOrgs } from '@/lib/org-search';
import { getAllOrgs, useSupabase, type Organization } from '@/lib/supabase';
import { colors, radii, space } from '@/theme';

type Props = {
  open: boolean;
  // The orgs you're already in, flagged in the list rather than hidden.
  myOrgIds: ReadonlySet<string>;
  onClose: () => void;
};

type OrgsState = { status: 'loading' } | { status: 'ready'; orgs: Organization[] } | { status: 'error' };

// "Find more orgs" on Profile: search every org, tap one to open its page.
export function FindOrgsSheet({ open, myOrgIds, onClose }: Props) {
  return (
    <BottomSheet onClose={onClose} backdropLabel="Dismiss find orgs" style={styles.sheet}>
      {open ? (dismiss) => <FindOrgs myOrgIds={myOrgIds} onDone={dismiss} /> : null}
    </BottomSheet>
  );
}

function FindOrgs({ myOrgIds, onDone }: { myOrgIds: ReadonlySet<string>; onDone: () => void }) {
  const supabase = useSupabase();
  const [state, setState] = useState<OrgsState>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    getAllOrgs(supabase).then(
      (orgs) => !cancelled && setState({ status: 'ready', orgs }),
      () => !cancelled && setState({ status: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [supabase, reloadKey]);

  const results = useMemo(
    () => (state.status === 'ready' ? searchOrgs(state.orgs, query, myOrgIds) : []),
    [state, query, myOrgIds],
  );

  function openOrg(slug: string | null) {
    if (!slug) return;
    onDone();
    router.push({ pathname: '/org/[orgSlug]', params: { orgSlug: slug } });
  }

  return (
    <View style={styles.content}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Find orgs
        </Text>
        <Pressable onPress={onDone} accessibilityRole="button" hitSlop={8} style={styles.done}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={16} color={colors.inkFaint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name"
          placeholderTextColor={colors.inkFaint}
          accessibilityLabel="Search orgs"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={styles.input}
        />
      </View>

      {state.status === 'loading' ? (
        <ActivityIndicator color={colors.accent} style={styles.status} />
      ) : state.status === 'error' ? (
        <View style={styles.status}>
          <Text style={styles.muted}>Couldn’t load orgs.</Text>
          <Pressable
            onPress={() => {
              setState({ status: 'loading' });
              setReloadKey((key) => key + 1);
            }}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.doneText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={({ org }) => org.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={results.length > 0 ? <Text style={styles.caption}>{query.trim() ? 'Results' : 'All orgs'}</Text> : undefined}
          ListEmptyComponent={<Text style={[styles.muted, styles.status]}>No orgs match “{query.trim()}”.</Text>}
          renderItem={({ item: { org, yours } }) => {
            const name = org.name ?? org.slug ?? 'Org';
            return (
              <Pressable
                onPress={() => openOrg(org.slug)}
                accessibilityRole="button"
                accessibilityLabel={yours ? `${name}, your org` : name}
                accessibilityHint="Opens this org"
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={[styles.crest, { backgroundColor: orgAccent(org.branding) ?? colors.accent }]}>
                  <Text style={styles.crestLetter}>{name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                {yours ? <Text style={styles.yours}>Your org</Text> : null}
                <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    height: '75%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.panel,
    borderTopRightRadius: radii.panel,
  },
  content: { flex: 1, padding: space[5], paddingBottom: space[6], gap: space[3] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.ink, fontSize: 22, fontWeight: '700' },
  done: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space[2] },
  doneText: { color: colors.accentOnSoft, fontWeight: '600' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.card,
  },
  input: { flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 },
  status: { marginTop: space[4], alignItems: 'center', gap: space[2] },
  muted: { color: colors.inkMuted, fontSize: 14, textAlign: 'center' },
  caption: { color: colors.inkFaint, fontSize: 12, marginBottom: space[1] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52 },
  pressed: { opacity: 0.6 },
  crest: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: radii.card },
  crestLetter: { color: colors.accentInk, fontWeight: '700' },
  name: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '600' },
  yours: { color: colors.inkMuted, fontSize: 12 },
});

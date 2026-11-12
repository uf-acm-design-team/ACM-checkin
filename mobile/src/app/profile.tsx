import { useUser } from '@clerk/expo';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AnimatedListHeight } from '@/components/animated-list-height';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ProfileBadge, ProfileBadgeDetails } from '@/components/profile-badge';
import { ProfileOrgRow } from '@/components/profile-org-row';
import { Screen } from '@/components/screen';
import { SemesterPicker } from '@/components/semester-picker';
import { orgActivity, semesterProfile } from '@/lib/profile-badges';
import { getMyProfile, useSupabase, type MyProfile } from '@/lib/supabase';
import { academicYearTerms, getTerm, type Term } from '@/lib/terms';
import { colors, radii, shadows, space } from '@/theme';

// How many badges fit across the row and the grid, and how many org rows show before "See all".
const BADGES_PER_ROW = 4;
const VISIBLE_ORGS = 5;

type ProfileState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profile: MyProfile };

export default function ProfileScreen() {
  const { user } = useUser();
  const supabase = useSupabase();
  const [state, setState] = useState<ProfileState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [allBadges, setAllBadges] = useState(false);
  const [selectedBadgeOrg, setSelectedBadgeOrg] = useState<string | null>(null);
  const [allOrgs, setAllOrgs] = useState(false);
  // The org whose row is open in "Your orgs"; one at a time.
  const [openOrg, setOpenOrg] = useState<string | null>(null);

  // Start on the current semester; the picker offers this academic year's three.
  const now = useMemo(() => new Date().toISOString(), []);
  const terms = useMemo(() => academicYearTerms(now), [now]);
  const [term, setTerm] = useState<Term>(() => getTerm(now));

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    (async () => {
      let next: ProfileState;
      try {
        next = { status: 'ready', profile: await getMyProfile(supabase) };
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

  const semester = useMemo(
    () =>
      state.status === 'ready'
        ? semesterProfile(state.profile.memberships, state.profile.checkIns, term, now)
        : null,
    [state, term, now],
  );

  const selectedBadge = semester?.badges.find(({ org }) => org.id === selectedBadgeOrg) ?? null;
  const name = user?.fullName || 'Your profile';
  const gradYear = state.status === 'ready' ? state.profile.attendee?.grad_year : null;

  let body: ReactNode;
  if (state.status === 'loading') {
    body = (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.muted}>Loading your profile…</Text>
      </View>
    );
  } else if (state.status === 'error') {
    body = (
      <View style={[styles.panel, styles.errorPanel]}>
        <Text style={styles.panelTitle}>Couldn&apos;t load your profile</Text>
        <Text style={styles.muted}>{state.message}</Text>
        <Button label="Try again" variant="secondary" onPress={retry} />
      </View>
    );
  } else if (!semester || semester.orgs.length === 0) {
    body = (
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>You haven&apos;t checked in anywhere yet</Text>
        <Text style={styles.muted}>
          Scan an org&apos;s QR code at a meeting and your badges will show up here.
        </Text>
      </View>
    );
  } else {
    const { badges, orgs, ended, summary } = semester;
    const shownOrgs = allOrgs ? orgs : orgs.slice(0, VISIBLE_ORGS);
    const badgeViews = badges.map((badge) => (
      <View key={badge.org.id} style={allBadges ? styles.gridCell : null}>
        <ProfileBadge badge={badge} inProgress={!ended} onPress={() => setSelectedBadgeOrg(badge.org.id)} />
      </View>
    ));

    body = (
      <>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Badges</Text>
            <SemesterPicker terms={terms} selected={term} onSelect={setTerm} />
          </View>
          <Text style={styles.muted}>{summary}</Text>
          <AnimatedListHeight>
            {badges.length === 0 ? (
              <Text style={styles.muted}>None of your orgs give badges yet.</Text>
            ) : allBadges ? (
              <View style={styles.grid}>{badgeViews}</View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {badgeViews}
              </ScrollView>
            )}
          </AnimatedListHeight>
          {badges.length > BADGES_PER_ROW ? (
            <TextLink
              expanded={allBadges}
              label={allBadges ? 'Show less' : `See all ${badges.length} badges`}
              onPress={() => setAllBadges((open) => !open)}
            />
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your orgs</Text>
          <AnimatedListHeight>
            <View style={styles.card}>
              {shownOrgs.map(({ org, count }, index) => {
                const membership = state.profile.memberships.find((entry) => entry.org_id === org.id);
                return membership ? (
                  <ProfileOrgRow
                    key={org.id}
                    membership={membership}
                    count={count}
                    activity={orgActivity(state.profile.checkIns, org.id)}
                    now={now}
                    expanded={openOrg === org.id}
                    divider={index > 0}
                    onToggle={() => setOpenOrg((open) => (open === org.id ? null : org.id))}
                  />
                ) : null;
              })}
            </View>
          </AnimatedListHeight>
          {orgs.length > VISIBLE_ORGS ? (
            <TextLink
              expanded={allOrgs}
              label={allOrgs ? 'Show less' : `See all ${orgs.length} orgs`}
              onPress={() => setAllOrgs((open) => !open)}
            />
          ) : null}
        </View>
      </>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
        }
      >
        {/* Profile opens over the tabs from the round button on Home and Calendar. */}
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
          {/* Settings holds your profile photo and Sign out. */}
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={8}
            style={({ pressed }) => [styles.settings, pressed && styles.settingsPressed]}
          >
            <Ionicons name="settings-outline" size={20} color={colors.inkStrong} />
          </Pressable>
        </View>
        <View style={styles.header}>
          <Avatar size={56} />
          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {gradYear ? <Text style={styles.muted}>Class of {gradYear}</Text> : null}
          </View>
        </View>

        {body}
      </ScrollView>
      <ProfileBadgeDetails
        badge={selectedBadge}
        semester={term.label}
        ended={semester?.ended ?? false}
        onClose={() => setSelectedBadgeOrg(null)}
      />
    </Screen>
  );
}

function TextLink({ expanded, label, onPress }: { expanded: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      hitSlop={8}
      style={styles.link}
    >
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: space[6],
    padding: space[4],
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settings: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
  },
  settingsPressed: {
    backgroundColor: colors.surfaceSunken,
  },
  backText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  section: {
    gap: space[2],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  row: {
    gap: space[3],
    paddingVertical: space[2],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space[4],
    paddingVertical: space[2],
  },
  gridCell: {
    width: `${100 / BADGES_PER_ROW}%`,
    alignItems: 'center',
  },
  link: {
    alignSelf: 'flex-start',
  },
  linkText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
    ...shadows.card,
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

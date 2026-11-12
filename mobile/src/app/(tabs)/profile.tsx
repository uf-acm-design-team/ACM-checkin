import { useClerk, useUser } from '@clerk/expo';
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
import { Button } from '@/components/button';
import { GLASS_TAB_BAR_SPACE } from '@/components/glass-tab-bar';
import { ProfileBadge, ProfileBadgeDetails } from '@/components/profile-badge';
import { Screen } from '@/components/screen';
import { SemesterPicker } from '@/components/semester-picker';
import { eventCount, semesterProfile } from '@/lib/profile-badges';
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

function initials(first: string | null | undefined, last: string | null | undefined, full: string) {
  const letters = first || last ? [first, last] : full.split(/\s+/).slice(0, 2);
  return letters.map((part) => part?.charAt(0) ?? '').join('').toUpperCase() || '?';
}

export default function ProfileScreen() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const supabase = useSupabase();
  const [signingOut, setSigningOut] = useState(false);
  const [state, setState] = useState<ProfileState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [allBadges, setAllBadges] = useState(false);
  const [selectedBadgeOrg, setSelectedBadgeOrg] = useState<string | null>(null);
  const [allOrgs, setAllOrgs] = useState(false);

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
              {shownOrgs.map(({ org, count }, index) => (
                <View key={org.id} style={[styles.orgRow, index > 0 && styles.orgRowDivider]}>
                  <Text style={styles.orgName} numberOfLines={1}>
                    {org.name ?? org.slug}
                  </Text>
                  <Text style={styles.muted}>{eventCount(count)}</Text>
                </View>
              ))}
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
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {initials(user?.firstName, user?.lastName, user?.fullName ?? '')}
            </Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {gradYear ? <Text style={styles.muted}>Class of {gradYear}</Text> : null}
          </View>
        </View>

        {body}

        {/* Signing out clears the stored session; the root navigator returns to sign-in. */}
        <Button
          label="Sign out"
          variant="secondary"
          loading={signingOut}
          onPress={async () => {
            setSigningOut(true);
            await signOut();
          }}
        />
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
    paddingBottom: space[4] + GLASS_TAB_BAR_SPACE,
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
  avatar: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
  },
  avatarText: {
    color: colors.accentOnSoft,
    fontSize: 20,
    fontWeight: '700',
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
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  orgRowDivider: {
    borderTopColor: colors.lineSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  orgName: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
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

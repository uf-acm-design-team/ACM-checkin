import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { orgAccent } from '@/lib/org-display';
import {
  callMemberCheckIn,
  CheckInNetworkError,
  getOrgBySlug,
  useSupabase,
  type MemberCheckInResult,
  type Organization,
} from '@/lib/supabase';
import { colors, radii, space } from '@/theme';

type OrgState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; org: Organization };

type CheckInState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'network-error'; message: string }
  | { status: 'answered'; result: MemberCheckInResult };

/**
 * Where a valid scan lands: check-in for the scanned org. Shows the org's
 * name and accent, then calls the member-check-in edge function with the
 * user's Clerk token. While that endpoint is a stub (ADTCIA-35) it answers
 * "not implemented"; the full check-in form is Week 4.
 */
export default function OrgCheckInScreen() {
  const { orgSlug } = useLocalSearchParams<{ orgSlug: string }>();
  const supabase = useSupabase();
  const [org, setOrg] = useState<OrgState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [checkIn, setCheckIn] = useState<CheckInState>({ status: 'idle' });

  useEffect(() => {
    if (!supabase || !orgSlug) return;

    let cancelled = false;
    (async () => {
      let next: OrgState;
      try {
        const found = await getOrgBySlug(supabase, orgSlug);
        next = found ? { status: 'ready', org: found } : { status: 'not-found' };
      } catch (error) {
        next = { status: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' };
      }
      if (!cancelled) setOrg(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, orgSlug, reloadKey]);

  const retryOrg = useCallback(() => {
    setOrg({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  const sendCheckIn = useCallback(async () => {
    if (!supabase || !orgSlug) return;
    setCheckIn({ status: 'sending' });
    try {
      const result = await callMemberCheckIn(supabase, { orgSlug, answers: {} });
      setCheckIn({ status: 'answered', result });
    } catch (error) {
      setCheckIn({
        status: 'network-error',
        message: error instanceof CheckInNetworkError ? error.message : 'Something went wrong.',
      });
    }
  }, [supabase, orgSlug]);

  const scanAgain = <Button label="Scan another code" variant="secondary" onPress={() => router.back()} />;

  if (org.status === 'loading') {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.muted}>Loading club…</Text>
        </View>
      </Screen>
    );
  }

  if (org.status !== 'ready') {
    return (
      <Screen>
        <View style={styles.body}>
          <View style={[styles.panel, styles.badPanel]}>
            <Text style={styles.panelTitle}>
              {org.status === 'not-found' ? 'We couldn’t find this club' : 'Couldn’t load this club'}
            </Text>
            <Text style={styles.muted}>
              {org.status === 'not-found'
                ? `No club uses the code “${orgSlug}”. Check you scanned the right QR code.`
                : org.message}
            </Text>
            {org.status === 'error' ? <Button label="Try again" onPress={retryOrg} /> : null}
          </View>
          {scanAgain}
        </View>
      </Screen>
    );
  }

  const accent = orgAccent(org.org.branding) ?? colors.accent;
  const orgName = org.org.name || orgSlug;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.panel}>
          <View style={styles.orgRow}>
            <View style={[styles.crest, { backgroundColor: accent }]}>
              <Text style={styles.crestText}>{orgName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.orgText}>
              <Text style={styles.eyebrow}>Check in to</Text>
              <Text style={styles.orgName}>{orgName}</Text>
            </View>
          </View>
          <View style={[styles.accentBar, { backgroundColor: accent }]} />
          <Button label="Check in" onPress={sendCheckIn} loading={checkIn.status === 'sending'} />
        </View>

        {checkIn.status === 'network-error' ? (
          <View accessibilityRole="alert" style={[styles.panel, styles.badPanel]}>
            <Text style={styles.panelTitle}>Couldn’t reach the server</Text>
            <Text style={styles.muted}>{checkIn.message}. Check your connection and try again.</Text>
          </View>
        ) : null}

        {checkIn.status === 'answered' ? <CheckInReply result={checkIn.result} /> : null}

        {scanAgain}
      </ScrollView>
    </Screen>
  );
}

type Tone = 'good' | 'warn' | 'bad';

/** Title and tone for each reply. Branches on the contract's stable `code`, never on `error` wording. */
function describeReply({ reply }: MemberCheckInResult): { title: string; tone: Tone } {
  if (!reply) return { title: 'Check-in service unavailable', tone: 'bad' };
  if (reply.ok) {
    return reply.alreadyCheckedIn
      ? { title: 'You’re already checked in', tone: 'good' }
      : { title: 'Checked in', tone: 'good' };
  }
  switch (reply.code) {
    case 'not_implemented':
      return { title: 'Check-in isn’t available yet', tone: 'warn' };
    case 'unauthenticated':
      return { title: 'Please sign in again', tone: 'bad' };
    case 'no_profile':
      return { title: 'Finish your profile first', tone: 'bad' };
    case 'wrong_password':
      return { title: 'Wrong meeting password', tone: 'bad' };
    case 'outside_geofence':
      return { title: 'You’re not at the meeting', tone: 'bad' };
    case 'no_active_meeting':
    case 'meeting_closed':
      return { title: 'No meeting is open right now', tone: 'warn' };
    case 'org_not_found':
      return { title: 'We couldn’t find this club', tone: 'bad' };
    default:
      return { title: 'Check-in failed', tone: 'bad' };
  }
}

/** Shows exactly what the server said, so the scan → server path is visible end to end. */
function CheckInReply({ result }: { result: MemberCheckInResult }) {
  const { title, tone } = describeReply(result);
  const { reply } = result;
  const message = reply && !reply.ok ? reply.error : null;
  const toneStyles = { good: styles.goodPanel, warn: styles.warnPanel, bad: styles.badPanel };

  return (
    <View accessibilityRole="alert" style={[styles.panel, toneStyles[tone]]}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.muted}>
        Server replied {result.status}
        {message ? `: “${message}”` : ''}
      </Text>
      {reply && !reply.ok && reply.code === 'not_implemented' ? (
        <Text style={styles.muted}>The app reached the check-in service. Checking in arrives next sprint.</Text>
      ) : null}
      {!reply && result.status === 404 && __DEV__ ? (
        <Text style={styles.muted}>
          The member-check-in function isn’t running. Start it with `npm run dev:functions` in the repo root.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
  body: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: space[4],
    padding: space[4],
  },
  panel: {
    gap: space[3],
    padding: space[5],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
  },
  goodPanel: {
    backgroundColor: colors.goodSurface,
    borderColor: colors.goodLine,
  },
  warnPanel: {
    backgroundColor: colors.warnSurface,
    borderColor: colors.warnLine,
  },
  badPanel: {
    backgroundColor: colors.badSurface,
    borderColor: colors.badLine,
  },
  panelTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  muted: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  crest: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
    borderRadius: radii.panel,
  },
  crestText: {
    color: colors.accentInk,
    fontSize: 20,
    fontWeight: '700',
  },
  orgText: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  orgName: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  accentBar: {
    height: 3,
    borderRadius: radii.pill,
  },
});

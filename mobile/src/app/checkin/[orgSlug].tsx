import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { CheckInReply, LocationProblem, membershipProgress } from '@/components/checkin/check-in-reply';
import { CheckInSuccess } from '@/components/checkin/check-in-success';
import { ChosenMeeting, MeetingPicker, NoOpenMeetings } from '@/components/checkin/meeting-picker';
import { Eyebrow, Muted, Panel } from '@/components/checkin/panel';
import { Questions } from '@/components/checkin/questions';
import { FormError, PasswordField } from '@/components/form';
import { Screen } from '@/components/screen';
import { buildCheckInRequest, needsLocation, validateAnswers, type AnswerMap, type AnswerValue } from '@/lib/check-in-form';
import { haptic } from '@/lib/haptics';
import { getCheckInLocation, type LocationFailure } from '@/lib/location';
import { orgAccent } from '@/lib/org-display';
import {
  callMemberCheckIn,
  CheckInNetworkError,
  getOpenMeetings,
  getOrgBySlug,
  useSupabase,
  type MemberCheckInResult,
  type OpenMeeting,
  type Organization,
} from '@/lib/supabase';
import { colors, radii, space } from '@/theme';

type OrgState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; org: Organization };

type MeetingsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; meetings: OpenMeeting[] };

type SubmitState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'sending' }
  | { status: 'location-failed'; failure: LocationFailure }
  | { status: 'network-error'; message: string }
  | { status: 'answered'; result: MemberCheckInResult; at: Date };

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.');

/**
 * Where a valid scan lands: check-in for the scanned org. Loads the org and its
 * open meetings, asks which one when several are open, then collects what that
 * meeting needs (password, its questions, the phone's location if geo-locked)
 * and sends it to member-check-in with the user's Clerk token.
 *
 * Follows the web check-in page's member path (app/[orgSlug]/checkin/page.tsx).
 * The server re-checks everything, so the checks here are for fast feedback.
 */
export default function OrgCheckInScreen() {
  const { orgSlug } = useLocalSearchParams<{ orgSlug: string }>();
  const supabase = useSupabase();
  const [org, setOrg] = useState<OrgState>({ status: 'loading' });
  const [orgReloadKey, setOrgReloadKey] = useState(0);
  const [meetings, setMeetings] = useState<MeetingsState>({ status: 'loading' });
  const [meetingsReloadKey, setMeetingsReloadKey] = useState(0);
  const [chosenId, setChosenId] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submit, setSubmit] = useState<SubmitState>({ status: 'idle' });

  useEffect(() => {
    if (!supabase || !orgSlug) return;

    let cancelled = false;
    (async () => {
      let next: OrgState;
      try {
        const found = await getOrgBySlug(supabase, orgSlug);
        next = found ? { status: 'ready', org: found } : { status: 'not-found' };
      } catch (error) {
        next = { status: 'error', message: errorMessage(error) };
      }
      if (!cancelled) setOrg(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, orgSlug, orgReloadKey]);

  const orgId = org.status === 'ready' ? org.org.id : null;
  useEffect(() => {
    if (!supabase || !orgId) return;

    let cancelled = false;
    (async () => {
      let next: MeetingsState;
      try {
        next = { status: 'ready', meetings: await getOpenMeetings(supabase, orgId) };
      } catch (error) {
        next = { status: 'error', message: errorMessage(error) };
      }
      if (!cancelled) setMeetings(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, orgId, meetingsReloadKey]);

  const retryOrg = useCallback(() => {
    setOrg({ status: 'loading' });
    setOrgReloadKey((key) => key + 1);
  }, []);

  /** Start the form over, for a different meeting or a fresh list. */
  const resetForm = useCallback(() => {
    setPassword('');
    setPasswordError(null);
    setAnswers({});
    setAnswerErrors({});
    setFormError(null);
    setSubmit({ status: 'idle' });
  }, []);

  const reloadMeetings = useCallback(() => {
    resetForm();
    setChosenId(null);
    setMeetings({ status: 'loading' });
    setMeetingsReloadKey((key) => key + 1);
  }, [resetForm]);

  const chooseMeeting = useCallback(
    (id: string | null) => {
      resetForm();
      setChosenId(id);
    },
    [resetForm],
  );

  const openMeetings = meetings.status === 'ready' ? meetings.meetings : [];
  // Picked for the member only when there's exactly one; with several, they choose.
  const meeting = openMeetings.length === 1 ? openMeetings[0] : openMeetings.find((m) => m.id === chosenId);

  const setAnswer = useCallback((questionId: string, value: AnswerValue) => {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    setAnswerErrors(({ [questionId]: _cleared, ...rest }) => rest);
  }, []);

  const sendCheckIn = useCallback(async () => {
    if (!supabase || !orgSlug || !meeting) return;

    const validated = validateAnswers(meeting.form_schema, answers);
    const missingPassword = Boolean(meeting.requires_checkin_password) && !password;
    setAnswerErrors(validated.errors);
    setPasswordError(missingPassword ? 'Enter the meeting password.' : null);
    if (!validated.ok || missingPassword) {
      setFormError(
        validated.ok ? 'Enter the meeting password to check in.' : 'Answer the required questions before checking in.',
      );
      setSubmit({ status: 'idle' });
      return;
    }
    setFormError(null);

    // Asked only here, for a geo-locked meeting, never just for opening the screen.
    let location = null;
    if (needsLocation(meeting)) {
      setSubmit({ status: 'locating' });
      const fix = await getCheckInLocation();
      if (!fix.ok) {
        setSubmit({ status: 'location-failed', failure: fix.failure });
        return;
      }
      location = fix.location;
    }

    setSubmit({ status: 'sending' });
    try {
      const result = await callMemberCheckIn(
        supabase,
        buildCheckInRequest({ orgSlug, meeting, password, answers: validated.answers, location }),
      );
      const { reply } = result;
      if (reply && !reply.ok) {
        haptic.error();
        if (reply.code === 'invalid_answers') setAnswerErrors(reply.answerErrors);
        if (reply.code === 'wrong_password') setPasswordError('That’s not the password for this meeting.');
      }
      setSubmit({ status: 'answered', result, at: new Date() });
    } catch (error) {
      haptic.error();
      setSubmit({
        status: 'network-error',
        message: error instanceof CheckInNetworkError ? error.message : 'Something went wrong.',
      });
    }
  }, [supabase, orgSlug, meeting, answers, password]);

  const scanAgain = <Button label="Scan another code" variant="secondary" onPress={() => router.back()} />;

  if (org.status === 'loading') {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loading}>Loading club…</Text>
        </View>
      </Screen>
    );
  }

  if (org.status !== 'ready') {
    return (
      <Screen>
        <View style={styles.body}>
          <Panel tone="bad" title={org.status === 'not-found' ? 'We couldn’t find this club' : 'Couldn’t load this club'}>
            <Muted>
              {org.status === 'not-found'
                ? `No club uses the code “${orgSlug}”. Check you scanned the right QR code.`
                : org.message}
            </Muted>
            {org.status === 'error' ? <Button label="Try again" onPress={retryOrg} /> : null}
          </Panel>
          {scanAgain}
        </View>
      </Screen>
    );
  }

  const accent = orgAccent(org.org.branding) ?? colors.accent;
  const orgName = org.org.name || orgSlug;
  const busy = submit.status === 'locating' || submit.status === 'sending';
  const questionCount = meeting?.form_schema.length ?? 0;

  // Checked in (or already was): the form is done, so the success screen takes over.
  if (submit.status === 'answered' && submit.result.reply?.ok && meeting) {
    const { alreadyCheckedIn } = submit.result.reply;
    return (
      <CheckInSuccess
        orgName={orgName}
        meetingTitle={meeting.title}
        alreadyCheckedIn={alreadyCheckedIn}
        checkedInAt={submit.at}
        membership={alreadyCheckedIn ? null : membershipProgress(submit.result)}
        onDone={() => router.dismissTo('/')}
      />
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Panel>
            <View style={styles.orgRow}>
              <View style={[styles.crest, { backgroundColor: accent }]}>
                <Text style={styles.crestText}>{orgName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.orgText}>
                <Eyebrow>Check in to</Eyebrow>
                <Text style={styles.orgName}>{orgName}</Text>
              </View>
            </View>
            <View style={[styles.accentBar, { backgroundColor: accent }]} />
            {meetings.status === 'loading' ? (
              <View style={styles.inline}>
                <ActivityIndicator color={colors.accent} />
                <Muted>Finding open meetings…</Muted>
              </View>
            ) : null}
          </Panel>

          {meetings.status === 'error' ? (
            <Panel tone="bad" title="Couldn’t load meetings">
              <Muted>{meetings.message}</Muted>
              <Button label="Try again" onPress={reloadMeetings} />
            </Panel>
          ) : null}

          {meetings.status === 'ready' && openMeetings.length === 0 ? (
            <NoOpenMeetings onRefresh={reloadMeetings} />
          ) : null}

          {openMeetings.length > 1 && !meeting ? <MeetingPicker meetings={openMeetings} onPick={chooseMeeting} /> : null}

          {meeting ? (
            <Panel>
              <ChosenMeeting
                meeting={meeting}
                onChange={openMeetings.length > 1 && !busy ? () => chooseMeeting(null) : undefined}
              />

              {meeting.requires_checkin_password ? (
                <View style={styles.field}>
                  <PasswordField
                    label="Meeting password"
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      setPasswordError(null);
                    }}
                    editable={!busy}
                    invalid={Boolean(passwordError)}
                    autoComplete="off"
                    textContentType="none"
                    placeholder="Shown at the front of the room"
                  />
                  {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}
                </View>
              ) : null}

              {questionCount > 0 ? (
                <View style={styles.field}>
                  <Eyebrow>
                    {questionCount} question{questionCount === 1 ? '' : 's'}
                  </Eyebrow>
                  <Questions
                    schema={meeting.form_schema}
                    answers={answers}
                    errors={answerErrors}
                    disabled={busy}
                    onChange={setAnswer}
                  />
                </View>
              ) : null}

              {needsLocation(meeting) ? (
                <View style={styles.locationNote}>
                  <Eyebrow>Location</Eyebrow>
                  <Muted>
                    This meeting checks that you’re in the room. When you tap Check in, the app asks for your
                    location and sends it with your check-in.
                  </Muted>
                </View>
              ) : null}

              <FormError message={formError} />
              {submit.status === 'locating' ? <Muted>Getting your location…</Muted> : null}
              <Button label="Check in" onPress={sendCheckIn} loading={busy} />
            </Panel>
          ) : null}

          {submit.status === 'location-failed' ? (
            <LocationProblem failure={submit.failure} onRetry={sendCheckIn} />
          ) : null}

          {submit.status === 'network-error' ? (
            <Panel tone="bad" title="Couldn’t reach the server">
              <Muted>{submit.message}. Check your connection and try again.</Muted>
            </Panel>
          ) : null}

          {submit.status === 'answered' && meeting ? (
            <CheckInReply result={submit.result} meetingTitle={meeting.title} onRefreshMeetings={reloadMeetings} />
          ) : null}

          {scanAgain}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
  loading: {
    color: colors.inkMuted,
    fontSize: 14,
  },
  body: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: space[4],
    padding: space[4],
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  field: { gap: space[2] },
  fieldError: {
    color: colors.badInk,
    fontSize: 12,
  },
  locationNote: {
    gap: space[1],
    padding: space[3],
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.control,
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

import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { LivePill } from '@/components/live-pill';
import { daysAway, formatAnswer } from '@/lib/meeting-details';
import { getMyMeetingCheckIn, useSupabase, type MeetingCheckIn, type OrgMeeting } from '@/lib/supabase';
import { getTerm, ORG_TIME_ZONE } from '@/lib/terms';
import { colors, radii, space } from '@/theme';

type Props = {
  // The meeting to show, or null to keep the sheet closed.
  meeting: OrgMeeting | null;
  orgName: string;
  now: string;
  // Whether that meeting is open for check-in right now.
  live?: boolean;
  onClose: () => void;
};

type Extra =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; checkIn: MeetingCheckIn };

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { timeZone: ORG_TIME_ZONE, hour: 'numeric', minute: '2-digit' });

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    timeZone: ORG_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

// A bottom sheet with one meeting's details. The row already has the title,
// date and description; the end time and your own check-in load when it opens.
export function MeetingDetails({ meeting, orgName, now, live, onClose }: Props) {
  return (
    <BottomSheet onClose={onClose} backdropLabel="Close meeting details" style={styles.sheet}>
      {meeting ? (dismiss) => (
        // Keyed so a different meeting starts from "loading", not the last one's details.
        <Sheet key={meeting.id} meeting={meeting} orgName={orgName} now={now} live={live} onClose={dismiss} />
      ) : null}
    </BottomSheet>
  );
}

function Sheet({ meeting, orgName, now, live, onClose }: Props & { meeting: OrgMeeting }) {
  const supabase = useSupabase();
  const [extra, setExtra] = useState<Extra>({ status: 'loading' });

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    (async () => {
      let next: Extra;
      try {
        next = { status: 'ready', checkIn: await getMyMeetingCheckIn(supabase, meeting.id) };
      } catch {
        next = { status: 'error' };
      }
      if (!cancelled) setExtra(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, meeting.id]);

  const checkIn = extra.status === 'ready' ? extra.checkIn : null;
  const upcoming = !meeting.attended && new Date(meeting.startTime).getTime() > new Date(now).getTime();
  const answered = meeting.questions
    .map((question) => ({ ...question, answer: formatAnswer(checkIn?.answers[question.id]) }))
    .filter((question) => question.answer);

  return (
    <>
      <View style={styles.grabber} />
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{meeting.title}</Text>
          <Text style={styles.muted}>{orgName}</Text>
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.inkMuted} />
        </Pressable>
      </View>

      {meeting.attended ? (
        <Pill icon="checkmark" tone="good">
          {checkIn?.checkedInAt ? `Checked in at ${time(checkIn.checkedInAt)}` : 'Checked in'}
        </Pill>
      ) : live ? (
        <View style={styles.live}>
          <LivePill />
        </View>
      ) : upcoming ? (
        <Pill icon="time-outline" tone="accent">
          {daysAway(meeting.startTime, now)}
        </Pill>
      ) : (
        <Pill icon="remove" tone="plain">
          Missed
        </Pill>
      )}

      <ScrollView>
        <Detail icon="calendar-outline">
          <Text style={styles.strong}>{longDate(meeting.startTime)}</Text>
          <Text style={styles.muted}>
            {checkIn?.endTime ? `${time(meeting.startTime)} – ${time(checkIn.endTime)}` : time(meeting.startTime)}
          </Text>
        </Detail>

        {meeting.description ? (
          <Detail icon="reorder-three-outline">
            <Text style={styles.body}>{meeting.description}</Text>
          </Detail>
        ) : null}

        {answered.length > 0 ? (
          <Detail icon="list-outline">
            <Text style={styles.strong}>Your answers</Text>
            {answered.map((question) => (
              <View key={question.id} style={styles.answer}>
                <Text style={styles.muted}>{question.label}</Text>
                <Text style={styles.strong}>{question.answer}</Text>
              </View>
            ))}
          </Detail>
        ) : null}

        {upcoming || (live && !meeting.attended) ? (
          <Detail icon="qr-code-outline">
            <Text style={styles.muted}>
              Scan the QR code at the meeting to check in. It counts toward {getTerm(meeting.startTime).label}.
            </Text>
          </Detail>
        ) : null}

        {extra.status === 'loading' ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : null}
        {extra.status === 'error' ? (
          <Text style={[styles.muted, styles.loading]}>Couldn&apos;t load the rest of this meeting&apos;s details.</Text>
        ) : null}
      </ScrollView>
    </>
  );
}

const PILL_TONES = {
  good: { backgroundColor: colors.goodSurface, color: colors.goodInk },
  accent: { backgroundColor: colors.accentSoft, color: colors.accentOnSoft },
  plain: { backgroundColor: colors.surfaceSunken, color: colors.inkStrong },
} as const;

function Pill({
  icon,
  tone,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: keyof typeof PILL_TONES;
  children: ReactNode;
}) {
  const { backgroundColor, color } = PILL_TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor }]}>
      <Ionicons name={icon} size={13} color={color} />
      <Text style={[styles.pillText, { color }]}>{children}</Text>
    </View>
  );
}

function Detail({ icon, children }: { icon: keyof typeof Ionicons.glyphMap; children: ReactNode }) {
  return (
    <View style={styles.detail}>
      <Ionicons name={icon} size={18} color={colors.inkMuted} style={styles.detailIcon} />
      <View style={styles.detailBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: '78%',
    paddingHorizontal: space[4],
    paddingTop: space[2],
    paddingBottom: space[8],
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    marginBottom: space[3],
    backgroundColor: colors.line,
    borderRadius: radii.pill,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  close: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    backgroundColor: colors.surfaceSunken,
    borderRadius: 14,
  },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    marginVertical: space[3],
    paddingHorizontal: space[2] + 2,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  live: {
    alignSelf: 'flex-start',
    marginVertical: space[3],
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  detail: {
    flexDirection: 'row',
    gap: space[3],
    paddingVertical: space[3],
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailIcon: {
    marginTop: 1,
  },
  detailBody: {
    flex: 1,
    gap: 2,
  },
  strong: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  body: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  muted: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  answer: {
    gap: 2,
    marginTop: space[2],
    padding: space[3],
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.card,
  },
  loading: {
    marginTop: space[3],
  },
});

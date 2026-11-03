import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import type { OpenMeeting } from '@/lib/supabase';
import { colors, radii, space } from '@/theme';

import { Chip, Muted, Panel } from './panel';

// The device's own zone: someone checking in is standing in the room, so
// their clock matches the meeting's.
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** "7:00 PM – 8:30 PM", or one side when the other isn't set. */
export function meetingTimes(meeting: Pick<OpenMeeting, 'start_time' | 'end_time'>): string | null {
  const format = (iso: string | null) => (iso ? timeFormat.format(new Date(iso)) : null);
  const start = format(meeting.start_time);
  const end = format(meeting.end_time);
  if (start && end) return `${start} – ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return null;
}

function MeetingDetails({ meeting }: { meeting: OpenMeeting }) {
  const times = meetingTimes(meeting);
  const details = [times, meeting.description].filter(Boolean).join(' · ');
  return (
    <>
      <Text style={styles.title}>{meeting.title}</Text>
      {details ? <Text style={styles.details}>{details}</Text> : null}
      {meeting.is_geo_locked || meeting.requires_checkin_password ? (
        <View style={styles.chips}>
          {meeting.is_geo_locked ? <Chip label="Location" /> : null}
          {meeting.requires_checkin_password ? <Chip label="Password" /> : null}
        </View>
      ) : null}
    </>
  );
}

/**
 * Several meetings are open at once. Ask rather than guess, like web: checking
 * someone into a meeting they didn't pick is worse than one extra tap, and
 * they'd never notice it went wrong.
 */
export function MeetingPicker({ meetings, onPick }: { meetings: OpenMeeting[]; onPick: (id: string) => void }) {
  return (
    <Panel title="Choose a meeting">
      <Muted>{meetings.length} meetings are open right now. Pick the one you’re attending.</Muted>
      {meetings.map((meeting) => (
        <Pressable
          key={meeting.id}
          accessibilityRole="button"
          accessibilityLabel={`Check in to ${meeting.title}`}
          onPress={() => onPick(meeting.id)}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
          <MeetingDetails meeting={meeting} />
        </Pressable>
      ))}
    </Panel>
  );
}

/** The meeting the form is for. `onChange` appears only when there was a real choice. */
export function ChosenMeeting({ meeting, onChange }: { meeting: OpenMeeting; onChange?: () => void }) {
  return (
    <View style={styles.chosen}>
      <MeetingDetails meeting={meeting} />
      {onChange ? (
        <Text accessibilityRole="button" onPress={onChange} style={styles.change}>
          Not this one? Choose a different meeting
        </Text>
      ) : null}
    </View>
  );
}

export function NoOpenMeetings({ onRefresh }: { onRefresh: () => void }) {
  return (
    <Panel tone="warn" title="No meeting is open right now">
      <Muted>Check-in opens when an officer starts the meeting. If it should be open, try again in a moment.</Muted>
      <Button label="Check again" variant="secondary" onPress={onRefresh} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[1],
    padding: space[4],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.card,
  },
  cardPressed: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chosen: {
    gap: space[1],
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  details: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[1] + 2,
    marginTop: space[1],
  },
  change: {
    marginTop: space[1],
    color: colors.inkMuted,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});

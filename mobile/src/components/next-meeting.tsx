import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LivePill } from '@/components/live-pill';
import { daysAway } from '@/lib/meeting-details';
import { ORG_TIME_ZONE } from '@/lib/terms';
import { colors, radii, space } from '@/theme';

const part = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString('en-US', { timeZone: ORG_TIME_ZONE, ...options });

const time = (iso: string) => part(iso, { hour: 'numeric', minute: '2-digit' });

/**
 * The box above the calendar: the org's next meeting with a date tile and a
 * countdown, or "Happening now" with the Live pill while one is open.
 * `live` is that open meeting's end time wrapped in an object, null otherwise.
 */
export function NextMeeting({
  meeting,
  live,
  now,
  onPress,
}: {
  meeting: { title: string; startTime: string };
  live: { endTime: string | null } | null;
  now: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Opens meeting details"
      style={({ pressed }) => [styles.box, pressed && styles.pressed]}
    >
      <Text style={styles.label}>{live ? 'Happening now' : 'Next meeting'}</Text>
      <View style={styles.row}>
        <View style={styles.tile}>
          <Text style={styles.tileMonth}>{part(meeting.startTime, { month: 'short' })}</Text>
          <Text style={styles.tileDay}>{part(meeting.startTime, { day: 'numeric' })}</Text>
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {meeting.title}
          </Text>
          <Text style={styles.when}>
            {live
              ? live.endTime
                ? `Ends ${time(live.endTime)}`
                : 'Check-in is open'
              : `${part(meeting.startTime, { weekday: 'short' })} · ${time(meeting.startTime)}`}
          </Text>
        </View>
        {live ? <LivePill solid /> : <Text style={styles.away}>{daysAway(meeting.startTime, now)}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: space[2],
    padding: space[4],
    backgroundColor: colors.accent,
    borderRadius: radii.card,
  },
  pressed: {
    backgroundColor: colors.accentDeep,
  },
  label: {
    color: colors.accentSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  tile: {
    alignItems: 'center',
    width: 46,
    paddingVertical: space[1],
    backgroundColor: colors.surface,
    borderRadius: radii.card,
  },
  tileMonth: {
    color: colors.accentOnSoft,
    fontSize: 11,
    fontWeight: '600',
  },
  tileDay: {
    color: colors.accentOnSoft,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 22,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.accentInk,
    fontSize: 16,
    fontWeight: '600',
  },
  when: {
    color: colors.accentSoft,
    fontSize: 13,
  },
  away: {
    color: colors.accentInk,
    fontSize: 13,
    fontWeight: '600',
  },
});

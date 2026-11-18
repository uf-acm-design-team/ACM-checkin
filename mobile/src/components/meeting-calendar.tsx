import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { monthGrid, monthLabel, type CalendarDay } from '@/lib/calendar';
import type { YearMonth } from '@/lib/terms';
import { colors, radii, space } from '@/theme';

type Props = {
  month: YearMonth;
  meetings: { title: string; startTime: string; attended: boolean }[];
  now: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onMove: (count: number) => void;
  // The day whose meetings are listed under the calendar, if any.
  selectedDay: number | null;
  onSelectDay: (day: number) => void;
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const STATUS_TEXT = { attended: 'checked in', missed: 'missed', upcoming: 'upcoming' } as const;

// One month of meetings: filled = checked in, outlined = missed, dashed = upcoming.
// A day with meetings can be tapped to pick it.
export function MeetingCalendar({
  month,
  meetings,
  now,
  canGoBack,
  canGoForward,
  onMove,
  selectedDay,
  onSelectDay,
}: Props) {
  const cells = monthGrid(month, meetings, now);

  return (
    <View style={styles.card}>
      <View style={styles.monthRow}>
        <MonthArrow icon="chevron-back" label="Previous month" enabled={canGoBack} onPress={() => onMove(-1)} />
        <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
        <MonthArrow icon="chevron-forward" label="Next month" enabled={canGoForward} onPress={() => onMove(1)} />
      </View>

      <View style={styles.grid}>
        {WEEKDAYS.map((weekday, index) => (
          <View key={`weekday-${index}`} style={styles.cell}>
            <Text style={styles.weekday}>{weekday}</Text>
          </View>
        ))}
        {cells.map((cell, index) => (
          <View key={cell ? `day-${cell.day}` : `blank-${index}`} style={styles.cell}>
            {cell ? (
              <Day cell={cell} selected={cell.day === selectedDay} onPress={() => onSelectDay(cell.day)} />
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <LegendItem style={styles.attended} label="Checked in" />
        <LegendItem style={styles.missed} label="Missed" />
        <LegendItem style={styles.upcoming} label="Upcoming" />
      </View>
    </View>
  );
}

function Day({ cell, selected, onPress }: { cell: CalendarDay; selected: boolean; onPress: () => void }) {
  const label = cell.status
    ? `${cell.day}: ${cell.titles.join(', ')}, ${STATUS_TEXT[cell.status]}`
    : String(cell.day);
  return (
    <Pressable
      // Only days with a meeting do anything.
      onPress={cell.status ? onPress : undefined}
      accessible
      accessibilityRole={cell.status ? 'button' : undefined}
      accessibilityState={cell.status ? { selected } : undefined}
      accessibilityLabel={cell.isToday ? `Today, ${label}` : label}
      style={[styles.day, cell.status && styles[cell.status], selected && styles.selected]}
    >
      <Text
        style={[
          styles.dayText,
          cell.status === 'attended' && styles.attendedText,
          cell.status === 'missed' && styles.missedText,
          cell.status === 'upcoming' && styles.upcomingText,
          cell.isToday && styles.todayText,
        ]}
      >
        {cell.day}
      </Text>
      {cell.isToday ? (
        <View style={[styles.todayDot, cell.status === 'attended' && styles.todayDotOnAccent]} />
      ) : null}
    </Pressable>
  );
}

function MonthArrow({
  icon,
  label,
  enabled,
  onPress,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  label: string;
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={enabled ? onPress : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      hitSlop={8}
      style={styles.arrow}
    >
      <Ionicons name={icon} size={20} color={enabled ? colors.inkStrong : colors.line} />
    </Pressable>
  );
}

function LegendItem({ style, label }: { style: object; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, style]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const DAY_SIZE = 34;

const styles = StyleSheet.create({
  card: {
    gap: space[3],
    padding: space[4],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthLabel: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  arrow: {
    padding: space[1],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 3,
  },
  weekday: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  day: {
    width: DAY_SIZE,
    height: DAY_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: DAY_SIZE / 2,
  },
  dayText: {
    color: colors.ink,
    fontSize: 14,
  },
  attended: {
    backgroundColor: colors.accent,
  },
  attendedText: {
    color: colors.accentInk,
    fontWeight: '600',
  },
  missed: {
    borderColor: colors.inkFaint,
    borderWidth: 1,
  },
  missedText: {
    color: colors.inkMuted,
  },
  upcoming: {
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  upcomingText: {
    color: colors.accentOnSoft,
    fontWeight: '600',
  },
  todayText: {
    fontWeight: '700',
  },
  selected: {
    borderColor: colors.ink,
    borderWidth: 2,
    borderStyle: 'solid',
  },
  todayDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink,
  },
  todayDotOnAccent: {
    backgroundColor: colors.accentInk,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[4],
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    color: colors.inkMuted,
    fontSize: 12,
  },
});

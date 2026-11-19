import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, useAnimatedValue, View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { useReducedMotion } from '@/lib/reduced-motion';
import { monthGrid, monthLabel, type CalendarDay, type CalendarDot } from '@/lib/calendar';
import type { YearMonth } from '@/lib/terms';
import { colors, radii, space } from '@/theme';

type Props = {
  month: YearMonth;
  meetings: { title: string; startTime: string; attended: boolean; accent?: string; orgName?: string }[];
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

// One month of meetings: filled = checked in (in that org's colour), outlined =
// missed, dashed = upcoming, and a ring in the text colour marks today. Dots
// under a day show each meeting in its org's colour: solid = checked in,
// hollow = missed, faded = upcoming. A day with meetings can be tapped to pick it.
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
  // Which way the month moved, so the new one slides in from that side:
  // 1 = later (from the right), -1 = earlier, 0 = first showing (no slide).
  const [shown, setShown] = useState(month);
  const [direction, setDirection] = useState(0);
  if (shown.year !== month.year || shown.month !== month.month) {
    setDirection(month.year * 12 + month.month > shown.year * 12 + shown.month ? 1 : -1);
    setShown(month);
  }
  const monthKey = `${month.year}-${month.month}`;
  // The org colour key, only when more than one org is on the calendar.
  const orgKey = [
    ...new Map(
      meetings.flatMap((meeting) => (meeting.orgName && meeting.accent ? [[meeting.orgName, meeting.accent] as const] : [])),
    ),
  ];

  return (
    <View style={styles.card}>
      <View style={styles.monthRow}>
        <MonthArrow icon="chevron-back" label="Previous month" enabled={canGoBack} onPress={() => onMove(-1)} />
        <MonthSlide key={monthKey} direction={direction} distance={12}>
          <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
        </MonthSlide>
        <MonthArrow icon="chevron-forward" label="Next month" enabled={canGoForward} onPress={() => onMove(1)} />
      </View>

      <View style={styles.grid}>
        {WEEKDAYS.map((weekday, index) => (
          <View key={`weekday-${index}`} style={styles.cell}>
            <Text style={styles.weekday}>{weekday}</Text>
          </View>
        ))}
      </View>
      {/* Keyed by month, so changing month slides the new days in and pops their dots. */}
      <MonthSlide key={monthKey} direction={direction} distance={28} style={styles.grid}>
        {cells.map((cell, index) => (
          <View key={cell ? `day-${cell.day}` : `blank-${index}`} style={styles.cell}>
            {cell ? (
              <Day
                cell={cell}
                selected={cell.day === selectedDay}
                onPress={() => {
                  haptic.tick();
                  onSelectDay(cell.day);
                }}
              />
            ) : null}
          </View>
        ))}
      </MonthSlide>

      <View style={styles.legend}>
        <LegendItem dot={{ color: colors.inkMuted, status: 'attended' }} label="Checked in" />
        <LegendItem dot={{ color: colors.inkMuted, status: 'missed' }} label="Missed" />
        <LegendItem dot={{ color: colors.inkMuted, status: 'upcoming' }} label="Upcoming" />
      </View>
      {orgKey.length > 1 ? (
        <View style={styles.legend}>
          {orgKey.map(([name, color]) => (
            <LegendItem key={name} dot={{ color, status: 'attended' }} label={name} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Slides its children in from `direction`'s side and fades them in, once, on mount. */
function MonthSlide({
  direction,
  distance,
  style,
  children,
}: {
  direction: number;
  distance: number;
  style?: object;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const enter = useAnimatedValue(direction === 0 || reduced ? 1 : 0);
  useEffect(() => {
    if (direction === 0 || reduced) return;
    const animation = Animated.timing(enter, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [direction, reduced, enter]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: enter,
          transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [direction * distance, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function Day({ cell, selected, onPress }: { cell: CalendarDay; selected: boolean; onPress: () => void }) {
  const reduced = useReducedMotion();
  // A tapped day dips and springs back.
  const pop = useAnimatedValue(1);
  useEffect(() => {
    if (!selected || reduced) return;
    pop.setValue(0.82);
    const animation = Animated.spring(pop, { toValue: 1, speed: 18, bounciness: 12, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [selected, reduced, pop]);
  const label = cell.status
    ? `${cell.day}: ${cell.titles.join(', ')}, ${STATUS_TEXT[cell.status]}`
    : String(cell.day);
  const filled = cell.status === 'attended';
  return (
    <Pressable
      // Only days with a meeting do anything.
      onPress={cell.status ? onPress : undefined}
      accessible
      accessibilityRole={cell.status ? 'button' : undefined}
      accessibilityState={cell.status ? { selected } : undefined}
      accessibilityLabel={cell.isToday ? `Today, ${label}` : label}
      style={styles.dayStack}
    >
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        {/* Rings sit outside a filled day, with a gap, so the org colour still
            shows. Drawn over the day rather than around it, so they don't
            widen it: a wider day made the grid wrap after six. */}
        {filled && (cell.isToday || selected) ? (
          <View pointerEvents="none" style={[styles.ring, cell.isToday ? styles.todayRing : styles.selectedRing]} />
        ) : null}
        <View
          style={[
            styles.day,
            cell.status && styles[cell.status],
            filled && cell.checkedInColor ? { backgroundColor: cell.checkedInColor } : null,
            selected && !filled && styles.selectedFill,
            cell.isToday && !filled && styles.today,
          ]}
        >
          <Text
            style={[
              styles.dayText,
              cell.status === 'attended' && styles.attendedText,
              cell.status === 'missed' && styles.missedText,
              cell.isToday && styles.todayText,
            ]}
          >
            {cell.day}
          </Text>
        </View>
      </Animated.View>
      <View style={styles.dots}>
        {cell.dots.slice(0, MAX_DOTS).map((dot, index) => (
          // Dots pop in across the month, a day at a time.
          <PopIn key={index} delay={Math.min(cell.day * 12 + index * 40, 450)}>
            <Dot dot={dot} />
          </PopIn>
        ))}
      </View>
    </Pressable>
  );
}

/** Grows its child in from nothing, once, on mount. */
function PopIn({ delay, children }: { delay: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const grow = useAnimatedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    const animation = Animated.spring(grow, { toValue: 1, delay, speed: 14, bounciness: 10, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [reduced, delay, grow]);
  return <Animated.View style={{ transform: [{ scale: grow }] }}>{children}</Animated.View>;
}

function Dot({ dot: { color, status } }: { dot: CalendarDot }) {
  const tint = color || colors.accent;
  return (
    <View
      style={[
        styles.dot,
        status === 'missed' ? { borderColor: tint, borderWidth: 1.25 } : { backgroundColor: tint },
        status === 'upcoming' && styles.dotUpcoming,
      ]}
    />
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

function LegendItem({ dot, label }: { dot: CalendarDot; label: string }) {
  return (
    <View style={styles.legendItem}>
      <Dot dot={dot} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const DAY_SIZE = 34;
// More than this many meetings in a day still shows three dots.
const MAX_DOTS = 3;

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
  dayStack: {
    alignItems: 'center',
    gap: 3,
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotUpcoming: {
    opacity: 0.4,
  },
  ring: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderWidth: 2,
    borderRadius: DAY_SIZE,
  },
  todayRing: {
    borderColor: colors.ink,
  },
  selectedRing: {
    borderColor: colors.line,
  },
  selectedFill: {
    backgroundColor: colors.surfaceSunken,
  },
  today: {
    borderColor: colors.ink,
    borderWidth: 2,
    borderStyle: 'solid',
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
    borderColor: colors.inkMuted,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  todayText: {
    fontWeight: '700',
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
  legendText: {
    color: colors.inkMuted,
    fontSize: 12,
  },
});

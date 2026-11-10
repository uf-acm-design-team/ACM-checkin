import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, space } from '@/theme';

type Props<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

// A two-or-more option switch whose purple highlight slides to the chosen side.
export function ViewSwitch<T extends string>({ options, value, onChange }: Props<T>) {
  const [width, setWidth] = useState(0);
  const index = Math.max(
    options.findIndex((option) => option.value === value),
    0,
  );
  const [position] = useState(() => new Animated.Value(index));

  useEffect(() => {
    Animated.timing(position, { toValue: index, duration: 220, useNativeDriver: true }).start();
  }, [index, position]);

  const segment = width > 0 ? (width - PADDING * 2) / options.length : 0;

  return (
    <View
      style={styles.track}
      accessibilityRole="tablist"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {segment > 0 ? (
        <Animated.View
          style={[
            styles.highlight,
            {
              width: segment,
              transform: [{ translateX: Animated.multiply(position, segment) }],
            },
          ]}
        />
      ) : null}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={styles.option}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const PADDING = 3;

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: PADDING,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.pill,
  },
  highlight: {
    position: 'absolute',
    top: PADDING,
    bottom: PADDING,
    left: PADDING,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space[2],
  },
  label: {
    color: colors.inkMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  labelActive: {
    color: colors.accentInk,
  },
});

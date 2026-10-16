import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radii, space } from '@/theme';

type Variant = 'primary' | 'secondary';

/** The two button tiers from web's primitives: accent primary, outlined secondary. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  /** Shows a spinner and blocks presses while an action is in flight. */
  loading?: boolean;
}) {
  const primary = variant === 'primary';
  const inactive = disabled || loading;
  const ink = primary ? colors.accentInk : colors.inkStrong;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        pressed && (primary ? styles.primaryPressed : styles.secondaryPressed),
        disabled && styles.disabled,
      ]}>
      {loading ? (
        <ActivityIndicator color={ink} />
      ) : (
        <Text style={[styles.label, { color: ink }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: space[4],
    borderRadius: radii.control,
  },
  primary: {
    backgroundColor: colors.accent,
  },
  primaryPressed: {
    backgroundColor: colors.accentDeep,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
  },
  secondaryPressed: {
    backgroundColor: colors.surfaceSunken,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
});

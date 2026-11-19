import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Avatar } from '@/components/avatar';
import { haptic } from '@/lib/haptics';
import { colors, space } from '@/theme';

const SIZE = 40;

/** The round button with your photo or initials, top right of a tab screen. Opens Profile. */
export function ProfileButton() {
  return (
    <Pressable
      onPress={() => {
        haptic.tick();
        router.push('/profile');
      }}
      accessibilityRole="button"
      accessibilityLabel="Profile"
      hitSlop={space[1]}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Avatar size={SIZE} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderColor: colors.accent,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: SIZE / 2 + 1,
  },
  pressed: {
    opacity: 0.7,
  },
});

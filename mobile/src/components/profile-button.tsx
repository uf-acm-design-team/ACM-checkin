import { useUser } from '@clerk/expo';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { haptic } from '@/lib/haptics';
import { colors, space } from '@/theme';

const SIZE = 40;

/** The round button with your initials, top right of a tab screen. Opens Profile. */
export function ProfileButton() {
  const { user } = useUser();
  const letters =
    [user?.firstName, user?.lastName].map((part) => part?.charAt(0) ?? '').join('').toUpperCase() || '?';

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
      <Text style={styles.letters}>{letters}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    width: SIZE,
    height: SIZE,
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: SIZE / 2,
  },
  pressed: {
    opacity: 0.7,
  },
  letters: {
    color: colors.accentOnSoft,
    fontSize: 15,
    fontWeight: '700',
  },
});

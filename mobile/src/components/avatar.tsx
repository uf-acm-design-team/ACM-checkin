import { useUser } from '@clerk/expo';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

/** Your profile photo in a circle, or your initials until you set one. */
export function Avatar({ size }: { size: number }) {
  const { user } = useUser();
  const round = { width: size, height: size, borderRadius: size / 2 };
  const letters = user?.firstName || user?.lastName ? [user.firstName, user.lastName] : (user?.fullName ?? '').split(/\s+/).slice(0, 2);
  const initials = letters.map((part) => part?.charAt(0) ?? '').join('').toUpperCase() || '?';

  return user?.hasImage ? (
    <Image source={{ uri: user.imageUrl }} style={[styles.photo, round]} accessibilityIgnoresInvertColors />
  ) : (
    <View style={[styles.initials, round]}>
      <Text style={[styles.letters, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: {
    backgroundColor: colors.surfaceSunken,
  },
  initials: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  letters: {
    color: colors.accentOnSoft,
    fontWeight: '700',
  },
});

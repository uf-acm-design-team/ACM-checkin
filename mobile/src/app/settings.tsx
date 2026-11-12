import { useClerk, useUser } from '@clerk/expo';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { colors, radii, space } from '@/theme';

/**
 * Settings, opened from the gear on Profile: change your profile photo and
 * sign out. The photo lives on your Clerk account, so it follows you to the web.
 */
export default function SettingsScreen() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [signingOut, setSigningOut] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function changePhoto() {
    if (!user) return;
    setPhotoError(null);
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    const photo = picked.canceled ? null : picked.assets[0];
    if (!photo?.base64) return;

    setSavingPhoto(true);
    try {
      await user.setProfileImage({ file: `data:${photo.mimeType ?? 'image/jpeg'};base64,${photo.base64}` });
    } catch {
      setPhotoError('Couldn’t save that photo. Try again.');
    } finally {
      setSavingPhoto(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile photo</Text>
          <View style={[styles.card, styles.photoRow]}>
            <Avatar size={64} />
            <View style={styles.photoText}>
              <Button
                label={user?.hasImage ? 'Change photo' : 'Add a photo'}
                variant="secondary"
                loading={savingPhoto}
                onPress={changePhoto}
              />
              {photoError ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {photoError}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <Text style={styles.muted}>Signed in as</Text>
            <Text style={styles.value} numberOfLines={1}>
              {user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? 'Your account'}
            </Text>
          </View>
          {/* Signing out clears the stored session; the root navigator returns to sign-in. */}
          <Button
            label="Sign out"
            variant="secondary"
            loading={signingOut}
            onPress={async () => {
              setSigningOut(true);
              await signOut();
            }}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: space[5],
    padding: space[4],
  },
  back: {
    alignSelf: 'flex-start',
  },
  backText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  section: {
    gap: space[2],
  },
  sectionTitle: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    gap: 2,
    padding: space[4],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
  },
  photoText: {
    flex: 1,
    gap: space[2],
  },
  muted: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  value: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    color: colors.badInk,
    fontSize: 13,
  },
});

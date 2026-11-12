import { useClerk, useUser } from '@clerk/expo';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { BottomSheet } from '@/components/bottom-sheet';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ViewSwitch } from '@/components/view-switch';
import { getThemeChoice, setThemeChoice, type ThemeChoice } from '@/lib/theme-preference';
import { colors, radii, space, supportsDarkMode } from '@/theme';

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Auto' },
] as const satisfies readonly { value: ThemeChoice; label: string }[];

/**
 * Settings, opened from the gear on Profile: change your profile photo and
 * sign out. The photo lives on your Clerk account, so it follows you to the web.
 *
 * The theme switch is real on iOS (see theme/adaptive.ts) and hidden on
 * Android, which has no dark mode yet. 'Auto' follows the phone.
 *
 * Delete account is the designed control only, and says so on screen: it
 * needs a server function that also removes the person's attendee data.
 */
export default function SettingsScreen() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [signingOut, setSigningOut] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteNote, setDeleteNote] = useState(false);

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

        {supportsDarkMode ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Appearance</Text>
            <ViewSwitch
              options={THEMES}
              value={theme}
              onChange={(next) => {
                setTheme(next);
                setThemeChoice(next);
              }}
            />
            {theme === 'auto' ? <Text style={styles.muted}>Follows your phone&apos;s appearance.</Text> : null}
          </View>
        ) : null}

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

        <Pressable
          onPress={() => {
            setDeleteNote(false);
            setConfirmingDelete(true);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.delete, pressed && styles.deletePressed]}
        >
          <Text style={styles.deleteText}>Delete account</Text>
        </Pressable>
      </ScrollView>

      <BottomSheet
        onClose={() => setConfirmingDelete(false)}
        backdropLabel="Cancel deleting your account"
        style={styles.sheet}
      >
        {confirmingDelete
          ? (dismiss) => (
              <>
                <Text style={styles.sheetTitle}>Delete your account?</Text>
                <Text style={styles.sheetBody}>
                  Your profile, memberships and check-in history will be removed. This can&apos;t be undone.
                </Text>
                {deleteNote ? (
                  <Text style={styles.error} accessibilityRole="alert">
                    Deleting accounts isn&apos;t available yet. Nothing was deleted.
                  </Text>
                ) : null}
                <Pressable
                  onPress={() => setDeleteNote(true)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.delete, styles.deleteSolid, pressed && styles.deleteSolidPressed]}
                >
                  <Text style={[styles.deleteText, styles.deleteSolidText]}>Delete account</Text>
                </Pressable>
                <Button label="Cancel" variant="secondary" onPress={dismiss} />
              </>
            )
          : null}
      </BottomSheet>
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
  delete: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: space[4],
    backgroundColor: colors.badSurface,
    borderColor: colors.badLine,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.control,
  },
  deletePressed: {
    backgroundColor: colors.badLine,
  },
  deleteText: {
    color: colors.badInk,
    fontSize: 16,
    fontWeight: '600',
  },
  deleteSolid: {
    backgroundColor: colors.bad,
    borderColor: colors.bad,
  },
  deleteSolidPressed: {
    backgroundColor: colors.badInk,
  },
  deleteSolidText: {
    color: colors.accentInk,
  },
  sheet: {
    gap: space[3],
    paddingHorizontal: space[4],
    paddingTop: space[5],
    paddingBottom: space[8],
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  sheetTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  sheetBody: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});

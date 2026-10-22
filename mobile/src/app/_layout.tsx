import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { PlaceholderScreen } from '@/components/screen';
import { env } from '@/lib/env';
import { ProfileStatusProvider, useProfileStatus } from '@/lib/profile-status';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  if (!env.clerkPublishableKey) {
    return <MissingConfig />;
  }

  return (
    // tokenCache stores the session in the device's secure storage, so a
    // signed-in user stays signed in across app restarts.
    <ClerkProvider publishableKey={env.clerkPublishableKey} tokenCache={tokenCache}>
      <ProfileStatusProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </ProfileStatusProvider>
    </ClerkProvider>
  );
}

/**
 * Exactly one group is reachable at a time:
 *   signed out                    → (auth)      sign in / sign up
 *   signed in, no attendees row   → onboarding  (mirrors web's proxy.ts gate)
 *   signed in, has a profile      → (tabs)
 * When the status changes (sign in, finish onboarding, sign out) Expo Router
 * moves the user to the right group automatically -- screens never redirect.
 */
function RootNavigator() {
  const { status } = useProfileStatus();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);

  // Keep the splash up while Clerk restores the session and the gate check
  // runs, so nobody flashes the wrong screen on launch.
  if (status === 'loading') return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'complete'}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'missing'}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signed-out'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

function MissingConfig() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <PlaceholderScreen
      title="Missing Clerk key"
      description="Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in mobile/.env.local (copy .env.example), then restart with `npx expo start -c`. See mobile/README.md."
    />
  );
}

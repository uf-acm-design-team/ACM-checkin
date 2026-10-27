import { useSSO } from '@clerk/expo';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { missingFieldsMessage } from '@/components/auth/finish';
import { Button } from '@/components/button';
import { clerkErrorMessage } from '@/lib/clerk-errors';

// Lets the in-app browser hand the Google result back to the app.
WebBrowser.maybeCompleteAuthSession();

/**
 * "Continue with Google". Works for both new and existing users: Clerk signs
 * in an existing account or creates one, then we activate the session and the
 * root navigator takes over (onboarding or tabs).
 */
export function GoogleButton({ onError }: { onError: (message: string | null) => void }) {
  const { startSSOFlow } = useSSO();
  const [loading, setLoading] = useState(false);

  // Android: pre-load the browser so the Google sheet opens instantly.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  async function onPress() {
    onError(null);
    setLoading(true);
    try {
      const { createdSessionId, setActive, signUp, authSessionResult } = await startSSOFlow({
        strategy: 'oauth_google',
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      } else if (authSessionResult?.type === 'success' && signUp?.status === 'missing_requirements') {
        // Google worked but Clerk wants more before creating the account.
        onError(missingFieldsMessage(signUp.missingFields));
      }
      // Otherwise the user closed the Google sheet -- not an error.
    } catch (err) {
      onError(clerkErrorMessage(err, "Couldn't sign in with Google. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return <Button label="Continue with Google" variant="secondary" onPress={onPress} loading={loading} />;
}

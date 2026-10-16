import { useAuth, useClerk, useUser } from '@clerk/expo';
import { useState } from 'react';

import { useFormAction } from '@/components/auth/use-form-action';
import { Button } from '@/components/button';
import { FooterText, FormError, FormScreen, TextField, TextLink } from '@/components/form';
import { env } from '@/lib/env';
import { submitOnboardingProfile } from '@/lib/onboarding';
import { useProfileStatus } from '@/lib/profile-status';

/**
 * Shown to signed-in users with no attendees row (see the root layout).
 * Same fields and rules as web's /onboarding.
 */
export default function OnboardingScreen() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const { markComplete, refresh } = useProfileStatus();

  // Google sign-ups already have a name in Clerk -- start from it.
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [gradYear, setGradYear] = useState('');
  const { loading, error, run } = useFormAction();

  // submitOnboardingProfile validates the fields itself (web's rules), so
  // invalid input comes back as an error without calling the server.
  const onSubmit = () =>
    run(async () => {
      const result = await submitOnboardingProfile({ firstName, lastName, gradYear }, () => getToken(), {
        supabaseUrl: env.supabaseUrl,
        supabaseAnonKey: env.supabaseAnonKey,
      });
      if (!result.ok) return result.error;

      if (result.saved) {
        // The edge function wrote the attendees row and updated the Clerk
        // name server-side. Pull the new name, then re-run the gate: it now
        // finds the row and the root navigator moves to the tabs.
        await user?.reload().catch(() => undefined);
        refresh();
        return null;
      }

      // Edge function not deployed yet (stub mode): set the name in Clerk
      // ourselves and let the user through for this app session.
      await user
        ?.update({ firstName: firstName.trim(), lastName: lastName.trim() })
        .catch((err) => console.warn('Could not update Clerk name', err));
      markComplete();
      return null;
    });

  return (
    <FormScreen
      title="Finish your profile"
      subtitle="Officers see this name on attendance lists."
      footer={
        <FooterText>
          Wrong account? <TextLink label="Sign out" onPress={() => void signOut()} />
        </FooterText>
      }>
      <TextField
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        placeholder="Maya"
        autoComplete="given-name"
        textContentType="givenName"
      />
      <TextField
        label="Last name"
        value={lastName}
        onChangeText={setLastName}
        placeholder="Rivera"
        autoComplete="family-name"
        textContentType="familyName"
      />
      <TextField
        label="Graduation year"
        value={gradYear}
        onChangeText={setGradYear}
        placeholder="2027"
        keyboardType="number-pad"
        maxLength={4}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />
      <FormError message={error} />
      <Button label="Continue" onPress={onSubmit} loading={loading} />
    </FormScreen>
  );
}

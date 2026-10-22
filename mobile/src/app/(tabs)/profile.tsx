import { useClerk, useUser } from '@clerk/expo';
import { useState } from 'react';

import { Button } from '@/components/button';
import { PlaceholderScreen } from '@/components/screen';

export default function ProfileScreen() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [signingOut, setSigningOut] = useState(false);

  const name = user?.fullName || 'Your profile';
  const email = user?.primaryEmailAddress?.emailAddress ?? '';

  return (
    <PlaceholderScreen title={name} description={email}>
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
    </PlaceholderScreen>
  );
}

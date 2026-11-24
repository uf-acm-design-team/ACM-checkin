import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/button';
import { PlaceholderScreen } from '@/components/screen';

/**
 * Where a valid scan lands. ADTCIA-40 turns this into the org's check-in
 * screen (name and accent from branding, then the member-check-in call).
 */
export default function OrgCheckInScreen() {
  const { orgSlug } = useLocalSearchParams<{ orgSlug: string }>();

  return (
    <PlaceholderScreen
      title="Check in"
      description={`Scanned check-in code for “${orgSlug}”.`}
      ticket="ADTCIA-40">
      <Button label="Scan another code" variant="secondary" onPress={() => router.back()} />
    </PlaceholderScreen>
  );
}

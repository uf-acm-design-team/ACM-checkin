import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { parseCheckinLink } from '@/lib/checkin-link';
import { colors, radii, space } from '@/theme';

/** How long "This isn't a check-in code" stays up before scanning resumes. */
const WRONG_CODE_MS = 2500;

/**
 * Check in tab: scan the QR code an officer shows (ADTCIA-18) and open
 * check-in for that org. Recognises the web's check-in links only; nothing
 * here talks to the network (that's the next screen, ADTCIA-40).
 */
export default function CheckInScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  // Only run the camera while this tab is on screen.
  const isFocused = useIsFocused();

  if (!permission) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  if (!permission.granted) {
    return <CameraPermissionNeeded canAskAgain={permission.canAskAgain} onAsk={requestPermission} />;
  }

  return <Scanner active={isFocused} />;
}

function Scanner({ active }: { active: boolean }) {
  const [wrongCode, setWrongCode] = useState(false);
  // The camera reports the same code many times a second; handle one at a time.
  const busy = useRef(false);
  const wrongCodeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Coming back to this tab (e.g. after checking in) starts a fresh scan.
  useEffect(() => {
    if (active) busy.current = false;
  }, [active]);

  useEffect(() => () => clearTimeout(wrongCodeTimer.current), []);

  const onScanned = useCallback(({ data }: BarcodeScanningResult) => {
    if (busy.current) return;
    busy.current = true;

    const orgSlug = parseCheckinLink(data);
    if (orgSlug) {
      router.push({ pathname: '/checkin/[orgSlug]', params: { orgSlug } });
      return; // stays busy until the user comes back to this tab
    }

    setWrongCode(true);
    wrongCodeTimer.current = setTimeout(() => {
      setWrongCode(false);
      busy.current = false;
    }, WRONG_CODE_MS);
  }, []);

  return (
    <View style={styles.cameraScreen}>
      {active ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScanned}
        />
      ) : null}

      <Screen transparent>
        <View style={styles.overlay}>
          <Text style={styles.hint}>Point your camera at the club&apos;s check-in QR code</Text>
          <View style={styles.frame} />
          {wrongCode ? (
            <View accessibilityRole="alert" style={styles.wrongCode}>
              <Text style={styles.wrongCodeTitle}>This isn&apos;t a check-in code</Text>
              <Text style={styles.wrongCodeBody}>Scan the QR code your club shows at the meeting.</Text>
            </View>
          ) : null}
        </View>
      </Screen>
    </View>
  );
}

function CameraPermissionNeeded({ canAskAgain, onAsk }: { canAskAgain: boolean; onAsk: () => void }) {
  return (
    <Screen>
      <View style={styles.centered}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>
            {canAskAgain ? 'Allow camera access' : 'Camera access is turned off'}
          </Text>
          <Text style={styles.muted}>
            {canAskAgain
              ? 'The app uses your camera to scan your club’s check-in QR code. Nothing is recorded.'
              : 'To scan check-in QR codes, turn on camera access for this app in Settings.'}
          </Text>
          {canAskAgain ? (
            <Button label="Allow camera" onPress={onAsk} />
          ) : (
            <Button label="Open Settings" onPress={() => void Linking.openSettings()} />
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[4],
  },
  panel: {
    alignSelf: 'stretch',
    gap: space[3],
    padding: space[5],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
  },
  panelTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  muted: {
    color: colors.inkMuted,
    fontSize: 15,
    lineHeight: 21,
  },
  cameraScreen: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[6],
    padding: space[6],
  },
  hint: {
    color: colors.accentInk,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  frame: {
    width: 240,
    height: 240,
    borderColor: colors.accentInk,
    borderWidth: 3,
    borderRadius: radii.panel,
  },
  wrongCode: {
    alignSelf: 'stretch',
    gap: space[1],
    padding: space[4],
    backgroundColor: colors.badSurface,
    borderColor: colors.badLine,
    borderWidth: 1,
    borderRadius: radii.card,
  },
  wrongCodeTitle: {
    color: colors.badInk,
    fontSize: 16,
    fontWeight: '700',
  },
  wrongCodeBody: {
    color: colors.badInk,
    fontSize: 14,
  },
});

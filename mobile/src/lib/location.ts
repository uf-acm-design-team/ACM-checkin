import * as Location from 'expo-location';

/**
 * Why there's no location to send. Each gets its own screen, like web's
 * geolock.ts: "denied" is fixed in Settings, the others by trying again.
 */
export type LocationFailure =
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'unavailable'; message: string }
  | { kind: 'timeout' };

export type LocationResult =
  | { ok: true; location: { latitude: number; longitude: number; accuracy: number | null } }
  | { ok: false; failure: LocationFailure };

/** Same budget as web's getCurrentPosition timeout, plus a little for the permission sheet. */
export const LOCATION_TIMEOUT_MS = 15_000;

/**
 * The phone's current fix, for a geo-locked check-in. Only called for a
 * geo-locked meeting, so the permission prompt never appears otherwise.
 * Foreground ("while using the app") permission only.
 *
 * The fix goes to member-check-in, which runs the geofence check itself
 * (lib/geo.ts). The app doesn't pre-check the distance: the server's
 * outside_geofence reply already says how far away the member is.
 */
export async function getCheckInLocation(timeoutMs = LOCATION_TIMEOUT_MS): Promise<LocationResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      return { ok: false, failure: { kind: 'denied', canAskAgain: permission.canAskAgain } };
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      timedOut,
    ]).finally(() => clearTimeout(timer));

    if (position === 'timeout') return { ok: false, failure: { kind: 'timeout' } };
    const { latitude, longitude, accuracy } = position.coords;
    return { ok: true, location: { latitude, longitude, accuracy } };
  } catch {
    // Thrown when Location Services are off, or no provider can get a fix.
    return {
      ok: false,
      failure: { kind: 'unavailable', message: 'Couldn’t get a location fix. Make sure Location Services are on.' },
    };
  }
}

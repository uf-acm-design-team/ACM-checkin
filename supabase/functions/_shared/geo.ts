/**
 * Geofence math shared by the check-in page and the check-in server actions.
 *
 * The page runs this first as the fast UX path (it can show "you're 340 m
 * away" without a round trip). The server actions run the same check again,
 * because anything enforced only in the browser can be skipped by calling the
 * action directly -- and with a static QR code, a photo of the code works from
 * anywhere. Both sides must use this one function so they never disagree about
 * whether someone is inside the radius.
 *
 * The coordinates still come from the client, so this stops casual bypass, not
 * a spoofed GPS fix.
 */

/** Used when a geo-locked meeting has no radius_meters set (matches the DB default). */
export const DEFAULT_RADIUS_METERS = 200;

export type Coordinates = {
  latitude: number;
  longitude: number;
  /** Reported fix accuracy in metres. Carried for diagnostics; not used to widen the radius. */
  accuracy?: number;
};

/** Great-circle distance between two points, in metres (haversine). */
export function distanceInMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Validate a caller-supplied location. Server actions receive whatever the
 * client serialised, so anything that is not a finite, in-range lat/lng is
 * treated as no location at all.
 */
export function parseCoordinates(value: unknown): Coordinates | null {
  if (!value || typeof value !== "object") return null;
  const { latitude, longitude, accuracy } = value as Record<string, unknown>;
  if (typeof latitude !== "number" || !Number.isFinite(latitude)) return null;
  if (typeof longitude !== "number" || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;

  const coords: Coordinates = { latitude, longitude };
  if (typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0) {
    coords.accuracy = accuracy;
  }
  return coords;
}

/**
 * Failures a geofence check can return. `too_far` carries the same fields the
 * page's TooFarState renders.
 */
export type GeofenceFailure =
  | { kind: "too_far"; metresAway: number; radius: number }
  | { kind: "location_required" };

export type GeofenceResult = { ok: true } | { ok: false; failure: GeofenceFailure };

/**
 * Decide whether `location` is inside the meeting's geofence.
 *
 * A meeting that is not geo-locked always passes. A geo-locked meeting with no
 * pin (latitude/longitude NULL) also passes: there is nothing to measure
 * against, and the page has always let those through. A geo-locked meeting
 * with a pin and a missing or malformed location is rejected, never allowed.
 */
export function checkGeofence(
  meeting: {
    is_geo_locked: boolean | null;
    latitude: number | null | undefined;
    longitude: number | null | undefined;
    radius_meters: number | null | undefined;
  },
  location: unknown,
): GeofenceResult {
  if (!meeting.is_geo_locked) return { ok: true };
  if (meeting.latitude == null || meeting.longitude == null) return { ok: true };

  const coords = parseCoordinates(location);
  if (!coords) return { ok: false, failure: { kind: "location_required" } };

  const radius = meeting.radius_meters || DEFAULT_RADIUS_METERS;
  const distance = distanceInMeters(
    coords.latitude,
    coords.longitude,
    meeting.latitude,
    meeting.longitude,
  );
  if (distance <= radius) return { ok: true };

  return {
    ok: false,
    failure: {
      kind: "too_far",
      // How much further they have to walk -- the actionable number the
      // screen leads with, not the raw distance to the pin.
      metresAway: Math.round(distance - radius),
      radius,
    },
  };
}

/** The user-facing message for a server-side geofence rejection. */
export function geofenceErrorMessage(failure: GeofenceFailure): string {
  return failure.kind === "too_far"
    ? `You're ${failure.metresAway} m outside the check-in area.`
    : "This meeting needs your location to check in.";
}

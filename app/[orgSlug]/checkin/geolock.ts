/**
 * Geolock distance check (browser side).
 *
 * Returns a discriminated result rather than a prose error string: the check-in
 * page renders a genuinely different screen for "you denied us location"
 * (recoverable with per-platform instructions) than for "you're 340 m away"
 * (recoverable by walking), and it cannot tell those apart from a message.
 *
 * This is the fast UX path only. The check-in server actions repeat the same
 * check (lib/geo.ts) against the coordinates returned here, so skipping this
 * file no longer skips the geolock.
 */

import { checkGeofence, type Coordinates } from "@/lib/geo";

export type GeoFailure =
    | { kind: "denied" }
    | { kind: "too_far"; metresAway: number; radius: number }
    | { kind: "unavailable"; message: string }
    | { kind: "timeout" };

/** On success, `location` is the fix to forward to the check-in server action. */
export type GeoResult =
    | { allowed: true; location: Coordinates }
    | { allowed: false; failure: GeoFailure };

function getUserLocation(): Promise<{ ok: true; loc: Coordinates } | { ok: false; failure: GeoFailure }> {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({
                ok: false,
                failure: { kind: "unavailable", message: "This browser can't share a location." },
            });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) =>
                resolve({
                    ok: true,
                    loc: {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                    },
                }),
            (error) => {
                if (error.code === error.PERMISSION_DENIED) {
                    resolve({ ok: false, failure: { kind: "denied" } });
                } else if (error.code === error.TIMEOUT) {
                    resolve({ ok: false, failure: { kind: "timeout" } });
                } else {
                    resolve({
                        ok: false,
                        failure: {
                            kind: "unavailable",
                            message: "Couldn't get a location fix. Make sure GPS is on.",
                        },
                    });
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}

export async function verifyGeoLock(
    meetingLat: number,
    meetingLng: number,
    maxRadiusMeters: number = 100
): Promise<GeoResult> {
    const located = await getUserLocation();
    if (!located.ok) return { allowed: false, failure: located.failure };

    // Same function the server actions call, so the two sides cannot disagree.
    const result = checkGeofence(
        {
            is_geo_locked: true,
            latitude: meetingLat,
            longitude: meetingLng,
            radius_meters: maxRadiusMeters,
        },
        located.loc
    );
    if (result.ok) return { allowed: true, location: located.loc };
    if (result.failure.kind === "too_far") return { allowed: false, failure: result.failure };

    // Only reachable if the browser handed back a non-finite fix.
    return {
        allowed: false,
        failure: { kind: "unavailable", message: "Couldn't get a location fix. Make sure GPS is on." },
    };
}

/** True when the browser can tell us the permission was already denied. */
export async function geoPermissionDenied(): Promise<boolean> {
    try {
        if (!navigator.permissions?.query) return false;
        const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
        return status.state === "denied";
    } catch {
        return false;
    }
}

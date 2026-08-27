/**
 * Geolock distance check.
 *
 * Returns a discriminated result rather than a prose error string: the check-in
 * page renders a genuinely different screen for "you denied us location"
 * (recoverable with per-platform instructions) than for "you're 340 m away"
 * (recoverable by walking), and it cannot tell those apart from a message.
 */

export type GeoFailure =
    | { kind: "denied" }
    | { kind: "too_far"; metresAway: number; radius: number }
    | { kind: "unavailable"; message: string }
    | { kind: "timeout" };

export type GeoResult = { allowed: true } | { allowed: false; failure: GeoFailure };

function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

type Located = { lat: number; lng: number };

function getUserLocation(): Promise<{ ok: true; loc: Located } | { ok: false; failure: GeoFailure }> {
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
                    loc: { lat: position.coords.latitude, lng: position.coords.longitude },
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

    const distance = getDistanceInMeters(
        located.loc.lat,
        located.loc.lng,
        meetingLat,
        meetingLng
    );
    if (distance <= maxRadiusMeters) return { allowed: true };

    return {
        allowed: false,
        failure: {
            kind: "too_far",
            // How much further they have to walk -- the actionable number the
            // screen leads with, not the raw distance to the pin.
            metresAway: Math.round(distance - maxRadiusMeters),
            radius: maxRadiusMeters,
        },
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

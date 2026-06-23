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

async function getUserLocation(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation is not supported by your browser."));
        } else {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    });
                },
                (error) => {
                    if (error.code === error.PERMISSION_DENIED) {
                        reject(new Error("Location access denied. Please allow location access in your browser to check in."));
                    } else {
                        reject(new Error("Unable to retrieve your location. Make sure your GPS is on."));
                    }
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        }
    });
}

export async function verifyGeoLock(
    meetingLat: number,
    meetingLng: number,
    maxRadiusMeters: number = 100
): Promise<{ allowed: boolean; error?: string }> {
    try {
        const userLoc = await getUserLocation();
        const distance = getDistanceInMeters(userLoc.lat, userLoc.lng, meetingLat, meetingLng);

        if (distance <= maxRadiusMeters) {
            return { allowed: true };
        } else {
            const distanceOff = Math.round(distance - maxRadiusMeters);
            return {
                allowed: false,
                error: `You are too far away. Please move ${distanceOff}m closer to the meeting location.`
            };
        }
    } catch (err: any) {
        return { allowed: false, error: err.message };
    }
}
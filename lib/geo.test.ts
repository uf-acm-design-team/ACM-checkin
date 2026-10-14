import { describe, it, expect } from "vitest";
import {
  DEFAULT_RADIUS_METERS,
  checkGeofence,
  distanceInMeters,
  parseCoordinates,
} from "./geo";

// Marston Science Library, UF -- a stand-in meeting pin.
const PIN = { latitude: 29.6481, longitude: -82.3437 };

const geoMeeting = {
  is_geo_locked: true,
  latitude: PIN.latitude,
  longitude: PIN.longitude,
  radius_meters: 100,
};

describe("distanceInMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceInMeters(PIN.latitude, PIN.longitude, PIN.latitude, PIN.longitude)).toBe(0);
  });

  it("measures one degree of latitude as ~111.2 km", () => {
    // R * π / 180 with R = 6371 km.
    expect(distanceInMeters(0, 0, 1, 0)).toBeCloseTo(111_194.93, 1);
  });

  it("shrinks a degree of longitude by cos(latitude)", () => {
    expect(distanceInMeters(60, 0, 60, 1)).toBeCloseTo(55_597, -1);
  });

  it("is symmetric", () => {
    const a = distanceInMeters(29.6481, -82.3437, 25.7617, -80.1918);
    const b = distanceInMeters(25.7617, -80.1918, 29.6481, -82.3437);
    expect(a).toBeCloseTo(b, 6);
  });

  it("matches a known city pair (Gainesville -> Miami, ~480 km)", () => {
    const d = distanceInMeters(29.6516, -82.3248, 25.7617, -80.1918);
    expect(d / 1000).toBeGreaterThan(470);
    expect(d / 1000).toBeLessThan(490);
  });
});

describe("parseCoordinates", () => {
  it("accepts a valid fix and keeps accuracy", () => {
    expect(parseCoordinates({ latitude: 1, longitude: 2, accuracy: 15 })).toEqual({
      latitude: 1,
      longitude: 2,
      accuracy: 15,
    });
  });

  it("drops a nonsense accuracy but keeps the fix", () => {
    expect(parseCoordinates({ latitude: 1, longitude: 2, accuracy: -5 })).toEqual({
      latitude: 1,
      longitude: 2,
    });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "29.6,-82.3"],
    ["an empty object", {}],
    ["string numbers", { latitude: "29.6", longitude: "-82.3" }],
    ["NaN", { latitude: NaN, longitude: 0 }],
    ["Infinity", { latitude: 0, longitude: Infinity }],
    ["latitude out of range", { latitude: 91, longitude: 0 }],
    ["longitude out of range", { latitude: 0, longitude: -181 }],
  ])("rejects %s", (_label, value) => {
    expect(parseCoordinates(value)).toBeNull();
  });
});

describe("checkGeofence", () => {
  it("passes any location when the meeting is not geo-locked", () => {
    expect(checkGeofence({ ...geoMeeting, is_geo_locked: false }, undefined)).toEqual({ ok: true });
  });

  it("passes a geo-locked meeting with no pin set", () => {
    expect(
      checkGeofence({ ...geoMeeting, latitude: null, longitude: null }, undefined),
    ).toEqual({ ok: true });
  });

  it("rejects a geo-locked meeting when coordinates are missing", () => {
    expect(checkGeofence(geoMeeting, undefined)).toEqual({
      ok: false,
      failure: { kind: "location_required" },
    });
  });

  it("rejects a geo-locked meeting when coordinates are malformed", () => {
    expect(checkGeofence(geoMeeting, { latitude: "here", longitude: 0 })).toEqual({
      ok: false,
      failure: { kind: "location_required" },
    });
  });

  it("allows a location inside the radius", () => {
    // ~55 m north of the pin.
    expect(
      checkGeofence(geoMeeting, { latitude: PIN.latitude + 0.0005, longitude: PIN.longitude }),
    ).toEqual({ ok: true });
  });

  it("allows a location exactly on the pin", () => {
    expect(checkGeofence(geoMeeting, PIN)).toEqual({ ok: true });
  });

  it("rejects a location outside the radius with how far there is left to walk", () => {
    // 0.003° of latitude ≈ 333.6 m, so 233.6 m past a 100 m radius.
    const result = checkGeofence(geoMeeting, {
      latitude: PIN.latitude + 0.003,
      longitude: PIN.longitude,
    });
    expect(result).toEqual({
      ok: false,
      failure: { kind: "too_far", metresAway: 234, radius: 100 },
    });
  });

  it("falls back to the default radius when radius_meters is unset", () => {
    // ~150 m away: outside 100 m, inside the 200 m default.
    const loc = { latitude: PIN.latitude + 0.00135, longitude: PIN.longitude };
    expect(checkGeofence({ ...geoMeeting, radius_meters: null }, loc)).toEqual({ ok: true });
    expect(DEFAULT_RADIUS_METERS).toBe(200);
  });

  it("does not widen the radius by the reported accuracy", () => {
    const result = checkGeofence(geoMeeting, {
      latitude: PIN.latitude + 0.003,
      longitude: PIN.longitude,
      accuracy: 5000,
    });
    expect(result.ok).toBe(false);
  });
});

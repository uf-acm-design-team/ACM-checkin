// Meeting form validation, run by the dashboard for feedback and by the server
// actions as the authority. The DB has no CHECK constraints on these columns.

import { parseCoordinates } from "./geo";
import { fromDateTimeLocal, toDateTimeLocal } from "./meeting-time";

export const RADIUS_MIN_METERS = 10;
export const RADIUS_MAX_METERS = 5000;

/** The create form's fields, as the browser holds them. */
export type MeetingDraft = {
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  status: boolean;
  is_geo_locked: boolean;
  latitude: string;
  longitude: string;
  radius_meters: string;
  is_officer_only: boolean;
  checkin_password: string;
};

/** The columns a validated draft writes to `meetings`. */
export type MeetingWrite = {
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  status: boolean;
  is_geo_locked: boolean;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  is_officer_only: boolean;
  checkin_password: string | null;
};

export type MeetingValidation =
  | { ok: true; value: MeetingWrite }
  | { ok: false; error: string };

const INVALID = "Invalid meeting details.";

// Plain decimals only; Number() alone also accepts "0x10", "1e1" and "Infinity".
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)$/;

const parseDecimal = (value: string): number | null => {
  const trimmed = value.trim();
  return DECIMAL.test(trimmed) ? Number(trimmed) : null;
};

const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// The round trip rejects dates fromDateTimeLocal would roll over (Feb 30) and
// the hour skipped at the spring DST change.
const toInstant = (value: string): string | null => {
  if (!DATETIME_LOCAL.test(value)) return null;
  const iso = fromDateTimeLocal(value);
  return iso && toDateTimeLocal(iso) === value ? iso : null;
};

const fail = (error: string): MeetingValidation => ({ ok: false, error });

export function validateMeetingDraft(input: unknown): MeetingValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(INVALID);
  const d = input as Record<string, unknown>;

  const isString = (v: unknown): v is string => typeof v === "string";
  const isOptionalString = (v: unknown) => v === undefined || isString(v);
  const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";

  if (
    !isString(d.title) ||
    !isString(d.start_time) ||
    !isString(d.end_time) ||
    !isOptionalString(d.description) ||
    !isOptionalString(d.checkin_password) ||
    !isBoolean(d.status) ||
    !isBoolean(d.is_geo_locked) ||
    !isBoolean(d.is_officer_only)
  ) {
    return fail(INVALID);
  }

  const title = d.title.trim();
  if (!title) return fail("A meeting needs a title.");

  // Compare instants, not strings.
  const startIso = toInstant(d.start_time);
  const endIso = toInstant(d.end_time);
  if (!startIso || !endIso) return fail("Enter a valid start and end time.");
  if (Date.parse(endIso) <= Date.parse(startIso)) {
    return fail("End time must be after the start time.");
  }

  // Cleared unless geo-locked, so a meeting keeps no stale pin.
  let latitude: number | null = null;
  let longitude: number | null = null;
  let radius: number | null = null;
  if (d.is_geo_locked) {
    if (!isString(d.latitude) || !isString(d.longitude) || !isString(d.radius_meters)) {
      return fail(INVALID);
    }
    if (!d.latitude.trim() || !d.longitude.trim()) {
      return fail(
        "Geo-locked meetings need a location. Use “Use current location” or enter coordinates.",
      );
    }
    const coords = parseCoordinates({
      latitude: parseDecimal(d.latitude),
      longitude: parseDecimal(d.longitude),
    });
    if (!coords) {
      return fail("Latitude must be between -90 and 90, and longitude between -180 and 180.");
    }
    const r = parseDecimal(d.radius_meters);
    if (r === null || !Number.isInteger(r) || r < RADIUS_MIN_METERS || r > RADIUS_MAX_METERS) {
      return fail(
        `Radius must be a whole number from ${RADIUS_MIN_METERS} to ${RADIUS_MAX_METERS} meters.`,
      );
    }
    latitude = coords.latitude;
    longitude = coords.longitude;
    radius = r;
  }

  return {
    ok: true,
    value: {
      title,
      description: (d.description ?? "").trim() || null,
      start_time: startIso,
      end_time: endIso,
      status: d.status,
      is_geo_locked: d.is_geo_locked,
      latitude,
      longitude,
      radius_meters: radius,
      is_officer_only: d.is_officer_only,
      checkin_password: (d.checkin_password ?? "").trim() || null,
    },
  };
}

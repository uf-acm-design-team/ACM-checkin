import { type Coordinates, parseCoordinates } from "../../../lib/geo.ts";

// Shape checks for the POST body fields lib/ doesn't already cover. Answers are
// passed through untouched for validateAnswers (lib/form-schema.ts), and the
// GPS fix is parsed by parseCoordinates (lib/geo.ts), the same as on web.
//
// Reports every problem at once, keyed by field, so a caller fixing their
// request sees the whole list in one round trip.

/** What the check-in logic receives: the same inputs memberCheckIn() takes. */
export type ParsedCheckIn = {
  orgSlug: string;
  meetingId?: string;
  password?: string;
  /** Untouched: validateAnswers() parses it against the meeting's form. */
  answers: unknown;
  /** null when no location was sent. */
  location: Coordinates | null;
};

export type ParseResult =
  | { ok: true; request: ParsedCheckIn }
  | { ok: false; fieldErrors: Record<string, string> };

// Identity comes from the JWT only. Rejected rather than ignored so a client
// that thinks it is choosing who checks in finds out immediately.
const IDENTITY_KEYS = ["user_id", "userId", "attendee_id", "attendeeId"];

// Mirrors MAX_SLUG_LENGTH in create-org.
const MAX_SLUG_LENGTH = 40;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** What the caller actually sent, for "expected X, got Y" messages. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

export function parseCheckInRequest(body: unknown): ParseResult {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      fieldErrors: { body: `Expected a JSON object, got ${describe(body)}.` },
    };
  }

  const errors: Record<string, string> = {};

  for (const key of IDENTITY_KEYS) {
    if (key in body) {
      errors[key] = "Not allowed. The caller is identified from the auth token.";
    }
  }

  // orgSlug: required, non-empty string.
  const orgSlug = typeof body.orgSlug === "string" ? body.orgSlug.trim() : "";
  if (body.orgSlug === undefined || body.orgSlug === null) {
    errors.orgSlug = "Required.";
  } else if (typeof body.orgSlug !== "string") {
    errors.orgSlug = `Expected a string, got ${describe(body.orgSlug)}.`;
  } else if (!orgSlug || orgSlug.length > MAX_SLUG_LENGTH) {
    errors.orgSlug = `Must be 1-${MAX_SLUG_LENGTH} characters.`;
  }

  // meetingId: optional uuid. Checked here so a malformed id is a 400, not a
  // Postgres "invalid input syntax for type uuid" 500 later.
  let meetingId: string | undefined;
  if (body.meetingId != null) {
    if (typeof body.meetingId !== "string") {
      errors.meetingId = `Expected a string, got ${describe(body.meetingId)}.`;
    } else if (!UUID.test(body.meetingId)) {
      errors.meetingId = "Expected a meeting UUID.";
    } else {
      meetingId = body.meetingId;
    }
  }

  // password: optional string, passed through untrimmed (it is compared exactly).
  let password: string | undefined;
  if (body.password != null) {
    if (typeof body.password !== "string") {
      errors.password = `Expected a string, got ${describe(body.password)}.`;
    } else {
      password = body.password;
    }
  }

  // latitude/longitude: optional, but if either is sent the pair must be a
  // fix parseCoordinates() accepts. Nothing sent -> null, and checkGeofence()
  // decides whether this meeting needed one.
  let location: Coordinates | null = null;
  if (body.latitude != null || body.longitude != null) {
    location = parseCoordinates({ latitude: body.latitude, longitude: body.longitude });
    if (!location) {
      errors.location =
        "Send latitude (-90 to 90) and longitude (-180 to 180) together, as numbers.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, fieldErrors: errors };
  }

  return {
    ok: true,
    request: { orgSlug, meetingId, password, answers: body.answers, location },
  };
}

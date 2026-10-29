import { describe, it, expect } from "vitest";
import {
  RADIUS_MAX_METERS,
  RADIUS_MIN_METERS,
  validateMeetingDraft,
  type MeetingDraft,
} from "./meeting-validation";

// Covers input a direct server-action call could send, not just what the form produces.

const INVALID = "Invalid meeting details.";
const NO_TITLE = "A meeting needs a title.";
const BAD_TIME = "Enter a valid start and end time.";
const END_BEFORE_START = "End time must be after the start time.";
const NO_LOCATION =
  "Geo-locked meetings need a location. Use “Use current location” or enter coordinates.";
const BAD_COORDS =
  "Latitude must be between -90 and 90, and longitude between -180 and 180.";
const BAD_RADIUS = "Radius must be a whole number from 10 to 5000 meters.";

const draft = (overrides: Partial<Record<keyof MeetingDraft, unknown>> = {}) => ({
  title: "General Meeting",
  description: "",
  start_time: "2026-09-03T15:00",
  end_time: "2026-09-03T16:00",
  status: true,
  is_geo_locked: false,
  latitude: "",
  longitude: "",
  radius_meters: "200",
  is_officer_only: false,
  checkin_password: "",
  ...overrides,
});

const geo = (overrides: Partial<Record<keyof MeetingDraft, unknown>> = {}) =>
  draft({
    is_geo_locked: true,
    latitude: "29.648",
    longitude: "-82.344",
    radius_meters: "200",
    ...overrides,
  });

const errorOf = (input: unknown) => {
  const result = validateMeetingDraft(input);
  return result.ok ? null : result.error;
};

const valueOf = (input: unknown) => {
  const result = validateMeetingDraft(input);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.value;
};

describe("validateMeetingDraft: shape", () => {
  it.each([null, undefined, "meeting", 42, [], true])(
    "rejects a non-object input (%j)",
    (input) => {
      expect(errorOf(input)).toBe(INVALID);
    },
  );

  it("rejects a non-string title", () => {
    expect(errorOf(draft({ title: 123 }))).toBe(INVALID);
  });

  it("rejects non-string times", () => {
    expect(errorOf(draft({ start_time: 1767225600000 }))).toBe(INVALID);
  });

  it.each(["status", "is_geo_locked", "is_officer_only"] as const)(
    "rejects a non-boolean %s",
    (field) => {
      expect(errorOf(draft({ [field]: "true" }))).toBe(INVALID);
    },
  );

  it("rejects a non-string description or password", () => {
    expect(errorOf(draft({ description: 5 }))).toBe(INVALID);
    expect(errorOf(draft({ checkin_password: { a: 1 } }))).toBe(INVALID);
  });

  it("accepts a valid draft and returns the full write payload", () => {
    expect(valueOf(draft())).toEqual({
      title: "General Meeting",
      description: null,
      start_time: "2026-09-03T19:00:00.000Z",
      end_time: "2026-09-03T20:00:00.000Z",
      status: true,
      is_geo_locked: false,
      latitude: null,
      longitude: null,
      radius_meters: null,
      is_officer_only: false,
      checkin_password: null,
    });
  });
});

describe("validateMeetingDraft: title", () => {
  it("rejects an empty title", () => {
    expect(errorOf(draft({ title: "" }))).toBe(NO_TITLE);
  });

  it("rejects a whitespace-only title", () => {
    // The HTML `required` attribute lets this through; it used to be saved as "".
    expect(errorOf(draft({ title: "   " }))).toBe(NO_TITLE);
  });

  it("trims the title", () => {
    expect(valueOf(draft({ title: "  Kickoff  " })).title).toBe("Kickoff");
  });
});

describe("validateMeetingDraft: times", () => {
  it.each([
    ["empty start", { start_time: "" }],
    ["empty end", { end_time: "" }],
    ["unparseable start", { start_time: "tomorrow" }],
    ["unparseable end", { end_time: "2026-09-03" }],
    ["impossible date", { start_time: "2026-02-30T10:00" }],
    ["impossible month", { start_time: "2026-13-01T10:00" }],
    ["impossible hour", { start_time: "2026-09-03T25:00" }],
    ["trailing junk", { start_time: "2026-09-03T15:00junk" }],
    // 2:00-3:00 AM does not exist in Eastern on the spring-forward date.
    ["skipped DST time", { start_time: "2026-03-08T02:30", end_time: "2026-03-08T04:00" }],
  ])("rejects a bad time: %s", (_label, overrides) => {
    expect(errorOf(draft(overrides))).toBe(BAD_TIME);
  });

  it("rejects an end time equal to the start time", () => {
    expect(
      errorOf(draft({ start_time: "2026-09-03T15:00", end_time: "2026-09-03T15:00" })),
    ).toBe(END_BEFORE_START);
  });

  it("rejects an end time before the start time", () => {
    expect(
      errorOf(draft({ start_time: "2026-09-03T15:00", end_time: "2026-09-03T14:59" })),
    ).toBe(END_BEFORE_START);
  });

  it("accepts an end time one minute after the start", () => {
    expect(
      errorOf(draft({ start_time: "2026-09-03T15:00", end_time: "2026-09-03T15:01" })),
    ).toBeNull();
  });

  it("converts summer times as Eastern daylight time (UTC-4)", () => {
    const v = valueOf(draft({ start_time: "2026-09-03T15:00", end_time: "2026-09-03T16:30" }));
    expect(v.start_time).toBe("2026-09-03T19:00:00.000Z");
    expect(v.end_time).toBe("2026-09-03T20:30:00.000Z");
  });

  it("converts winter times as Eastern standard time (UTC-5)", () => {
    const v = valueOf(draft({ start_time: "2026-01-15T15:00", end_time: "2026-01-15T16:00" }));
    expect(v.start_time).toBe("2026-01-15T20:00:00.000Z");
  });

  it("compares instants across a DST change", () => {
    // Clocks fall back at 2:00 AM on 2026-11-01, so this window is 3.5 hours.
    const v = valueOf(draft({ start_time: "2026-11-01T00:30", end_time: "2026-11-01T03:00" }));
    expect(Date.parse(v.end_time) - Date.parse(v.start_time)).toBe(3.5 * 60 * 60 * 1000);
  });
});

describe("validateMeetingDraft: geo-lock off", () => {
  it("ignores and clears location fields, even invalid ones", () => {
    const v = valueOf(
      draft({ is_geo_locked: false, latitude: "abc", longitude: 999, radius_meters: "1" }),
    );
    expect(v.latitude).toBeNull();
    expect(v.longitude).toBeNull();
    expect(v.radius_meters).toBeNull();
  });
});

describe("validateMeetingDraft: geo-lock on", () => {
  it("accepts a valid location and parses it to numbers", () => {
    const v = valueOf(geo({ latitude: " 29.648 ", longitude: "-82.344", radius_meters: " 200 " }));
    expect(v.is_geo_locked).toBe(true);
    expect(v.latitude).toBe(29.648);
    expect(v.longitude).toBe(-82.344);
    expect(v.radius_meters).toBe(200);
  });

  it.each([
    ["latitude", { latitude: "" }],
    ["latitude", { latitude: "   " }],
    ["longitude", { longitude: "" }],
  ])("requires a %s", (_label, overrides) => {
    expect(errorOf(geo(overrides))).toBe(NO_LOCATION);
  });

  it("rejects non-string coordinates", () => {
    expect(errorOf(geo({ latitude: 29.6 }))).toBe(INVALID);
  });

  it.each(["abc", "0x10", "1e1", "Infinity", "NaN", "29.6.1", "--5"])(
    "rejects a non-decimal latitude (%s)",
    (latitude) => {
      // "abc" used to become NaN, which JSON sends as null: a geo-locked
      // meeting with no pin.
      expect(errorOf(geo({ latitude }))).toBe(BAD_COORDS);
    },
  );

  it.each(["90", "-90", "0", "+45.5", ".5"])("accepts latitude %s", (latitude) => {
    expect(errorOf(geo({ latitude }))).toBeNull();
  });

  it.each(["90.0001", "-90.0001", "91"])("rejects latitude %s", (latitude) => {
    expect(errorOf(geo({ latitude }))).toBe(BAD_COORDS);
  });

  it.each(["180", "-180"])("accepts longitude %s", (longitude) => {
    expect(errorOf(geo({ longitude }))).toBeNull();
  });

  it.each(["180.0001", "-181", "abc"])("rejects longitude %s", (longitude) => {
    expect(errorOf(geo({ longitude }))).toBe(BAD_COORDS);
  });

  it("exposes the radius bounds", () => {
    expect(RADIUS_MIN_METERS).toBe(10);
    expect(RADIUS_MAX_METERS).toBe(5000);
  });

  it.each(["10", "5000", "200", "200.0"])("accepts radius %s", (radius_meters) => {
    expect(errorOf(geo({ radius_meters }))).toBeNull();
  });

  it.each(["9", "5001", "0", "-50", "150.5", "", "  ", "abc", "1e3"])(
    "rejects radius %j",
    (radius_meters) => {
      expect(errorOf(geo({ radius_meters }))).toBe(BAD_RADIUS);
    },
  );

  it("rejects a non-string radius", () => {
    expect(errorOf(geo({ radius_meters: 200 }))).toBe(INVALID);
  });
});

describe("validateMeetingDraft: optional fields", () => {
  it("stores a blank description as null and trims a real one", () => {
    expect(valueOf(draft({ description: "   " })).description).toBeNull();
    expect(valueOf(draft({ description: "  Pizza after  " })).description).toBe("Pizza after");
  });

  it("stores a blank password as null and trims a real one", () => {
    expect(valueOf(draft({ checkin_password: "   " })).checkin_password).toBeNull();
    expect(valueOf(draft({ checkin_password: " room42 " })).checkin_password).toBe("room42");
  });

  it("treats a missing description or password as blank", () => {
    const input: Record<string, unknown> = draft();
    delete input.description;
    delete input.checkin_password;
    const v = valueOf(input);
    expect(v.description).toBeNull();
    expect(v.checkin_password).toBeNull();
  });

  it("passes status and officer-only through", () => {
    const v = valueOf(draft({ status: false, is_officer_only: true }));
    expect(v.status).toBe(false);
    expect(v.is_officer_only).toBe(true);
  });
});

describe("validateMeetingDraft: fields the caller must not set", () => {
  it("drops identity and ownership fields from the payload", () => {
    const v = valueOf(
      draft({
        created_by: "user_someone_else",
        org_id: "00000000-0000-0000-0000-000000000000",
        id: "11111111-1111-1111-1111-111111111111",
        form_schema: [{ id: "q", type: "text" }],
      } as Record<string, unknown>),
    );
    expect(Object.keys(v).sort()).toEqual(
      [
        "checkin_password",
        "description",
        "end_time",
        "is_geo_locked",
        "is_officer_only",
        "latitude",
        "longitude",
        "radius_meters",
        "start_time",
        "status",
        "title",
      ].sort(),
    );
  });
});

import { describe, expect, it } from "vitest";

import { parseCheckInRequest } from "./validate.ts";

const UUID = "6f1c2a9e-1d2b-4c3d-8e9f-0a1b2c3d4e5f";

// Parse a body that must be accepted, failing with the field errors if not.
function accepted(body: unknown) {
  const result = parseCheckInRequest(body);
  if (!result.ok) {
    throw new Error(`expected the body to be accepted, got ${JSON.stringify(result.fieldErrors)}`);
  }
  return result.request;
}

// Parse a body that must be rejected, failing with the parsed request if not.
function rejected(body: unknown) {
  const result = parseCheckInRequest(body);
  if (result.ok) {
    throw new Error(`expected the body to be rejected, got ${JSON.stringify(result.request)}`);
  }
  return result.fieldErrors;
}

describe("body", () => {
  it.each([
    ["null", null],
    ["an array", []],
    ["a string", "acm"],
    ["a number", 42],
    ["a boolean", true],
  ])("rejects %s as the whole body", (described, body) => {
    expect(rejected(body)).toEqual({ body: `Expected a JSON object, got ${described}.` });
  });

  it("accepts the minimal body and fills in the absent fields", () => {
    expect(accepted({ orgSlug: "acm" })).toEqual({
      orgSlug: "acm",
      meetingId: undefined,
      password: undefined,
      answers: undefined,
      location: null,
    });
  });

  it("ignores unknown keys and does not copy them into the request", () => {
    const request = accepted({ orgSlug: "acm", foo: 1 });
    expect(request).not.toHaveProperty("foo");
  });

  it("reports every problem at once", () => {
    const errors = rejected({
      orgSlug: [],
      meetingId: "nope",
      password: 1,
      user_id: "user_x",
      latitude: "29.6",
    });
    expect(Object.keys(errors).sort()).toEqual(
      ["location", "meetingId", "orgSlug", "password", "user_id"],
    );
  });
});

describe("identity keys", () => {
  const IDENTITY_KEYS = ["user_id", "userId", "attendee_id", "attendeeId"];

  it.each(IDENTITY_KEYS)("rejects %s even alongside an otherwise valid body", (key) => {
    const errors = rejected({ orgSlug: "acm", [key]: "someone-else" });
    expect(errors).toEqual({
      [key]: "Not allowed. The caller is identified from the auth token.",
    });
  });

  it.each(IDENTITY_KEYS)("rejects %s by presence alone, even when null", (key) => {
    expect(rejected({ orgSlug: "acm", [key]: null })).toHaveProperty(key);
  });

  it("reports all four when all four are sent", () => {
    const body = Object.fromEntries(IDENTITY_KEYS.map((k) => [k, "x"]));
    expect(Object.keys(rejected({ orgSlug: "acm", ...body })).sort()).toEqual(
      [...IDENTITY_KEYS].sort(),
    );
  });
});

describe("orgSlug", () => {
  it.each([
    ["missing", {}],
    ["null", { orgSlug: null }],
  ])("is required (%s)", (_, body) => {
    expect(rejected(body)).toEqual({ orgSlug: "Required." });
  });

  it("must be a string", () => {
    expect(rejected({ orgSlug: 5 })).toEqual({ orgSlug: "Expected a string, got a number." });
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["41 characters", "a".repeat(41)],
  ])("rejects %s", (_, orgSlug) => {
    expect(rejected({ orgSlug })).toEqual({ orgSlug: "Must be 1-40 characters." });
  });

  it("accepts 1 and exactly 40 characters", () => {
    expect(accepted({ orgSlug: "a" }).orgSlug).toBe("a");
    expect(accepted({ orgSlug: "a".repeat(40) }).orgSlug).toBe("a".repeat(40));
  });

  it("trims, and measures the length after trimming", () => {
    expect(accepted({ orgSlug: "  acm  " }).orgSlug).toBe("acm");
    expect(accepted({ orgSlug: ` ${"a".repeat(40)} ` }).orgSlug).toBe("a".repeat(40));
  });
});

describe("meetingId", () => {
  it.each([
    ["lowercase", UUID],
    ["uppercase", UUID.toUpperCase()],
    ["mixed case", "6F1c2A9e-1D2b-4C3d-8E9f-0A1b2C3d4E5f"],
  ])("normalizes a %s UUID to lowercase", (_, meetingId) => {
    expect(accepted({ orgSlug: "acm", meetingId }).meetingId).toBe(UUID);
  });

  it.each([undefined, null])("treats %s as not provided", (meetingId) => {
    expect(accepted({ orgSlug: "acm", meetingId }).meetingId).toBeUndefined();
  });

  it.each([
    ["not a UUID", "abc"],
    ["no dashes", UUID.replaceAll("-", "")],
    ["braces", `{${UUID}}`],
    ["surrounding whitespace", ` ${UUID} `],
    ["one character short", UUID.slice(0, -1)],
  ])("rejects %s", (_, meetingId) => {
    expect(rejected({ orgSlug: "acm", meetingId })).toEqual({
      meetingId: "Expected a meeting UUID.",
    });
  });

  it("must be a string", () => {
    expect(rejected({ orgSlug: "acm", meetingId: 7 })).toEqual({
      meetingId: "Expected a string, got a number.",
    });
  });
});

describe("password", () => {
  it("passes through untrimmed, since it is compared exactly", () => {
    expect(accepted({ orgSlug: "acm", password: " pw " }).password).toBe(" pw ");
  });

  it("treats null as not provided", () => {
    expect(accepted({ orgSlug: "acm", password: null }).password).toBeUndefined();
  });

  it("must be a string", () => {
    expect(rejected({ orgSlug: "acm", password: true })).toEqual({
      password: "Expected a string, got a boolean.",
    });
  });
});

describe("answers", () => {
  // Deliberately untouched here: validateAnswers() (form-schema) owns them.
  it("passes the caller's value through by reference", () => {
    const answers = { q1: "hi", q2: ["a", "b"], q3: 4 };
    expect(accepted({ orgSlug: "acm", answers }).answers).toBe(answers);
  });

  it.each([42, "x", [1, 2], null])("does not reject %j (form-schema decides)", (answers) => {
    expect(accepted({ orgSlug: "acm", answers }).answers).toBe(answers);
  });
});

describe("latitude / longitude", () => {
  // TODO(human)
  it.each([
    
  ])
  
  ("pairs latitude and longitude", () => {

  });
});

import { describe, expect, it } from "vitest";

import { MAX_NAME_LENGTH, parseOnboardingFields, sanitizeName } from "./validate.ts";

describe("parseOnboardingFields", () => {
  it.each([
    ["an empty body", {}],
    ["all fields null", { firstName: null, lastName: null, gradYear: null }],
    ["only unrelated keys", { orgSlug: "acm" }],
  ])("treats %s as link-only", (_, body) => {
    expect(parseOnboardingFields(body)).toEqual({ ok: true, request: { mode: "link" } });
  });

  it("accepts a full profile and cleans it up", () => {
    expect(
      parseOnboardingFields({ firstName: "  Ada   Mae ", lastName: "Lovelace", gradYear: " 2027 " }),
    ).toEqual({
      ok: true,
      request: {
        mode: "profile",
        profile: { firstName: "Ada Mae", lastName: "Lovelace", gradYear: "2027" },
      },
    });
  });

  it("accepts a numeric grad year", () => {
    const result = parseOnboardingFields({ firstName: "Ada", lastName: "L", gradYear: 2027 });
    expect(result).toEqual({
      ok: true,
      request: { mode: "profile", profile: { firstName: "Ada", lastName: "L", gradYear: "2027" } },
    });
  });

  it.each([
    ["one field missing", { firstName: "Ada", lastName: "Lovelace" }],
    ["a blank field", { firstName: "Ada", lastName: "   ", gradYear: "2027" }],
    ["a single empty field", { firstName: "" }],
  ])("rejects %s", (_, body) => {
    expect(parseOnboardingFields(body)).toEqual({ ok: false, error: "Missing required fields." });
  });
});

describe("sanitizeName", () => {
  it("caps the length", () => {
    expect(sanitizeName("a".repeat(MAX_NAME_LENGTH + 20))).toHaveLength(MAX_NAME_LENGTH);
  });
});

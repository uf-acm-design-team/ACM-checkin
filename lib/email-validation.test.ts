import { describe, expect, it } from "vitest";

import { EMAIL_MAX_LENGTH, validateEmail } from "./email-validation";

const valueOf = (input: unknown) => {
  const result = validateEmail(input);
  return result.ok ? result.value : null;
};

describe("validateEmail", () => {
  it.each([
    "student@ufl.edu",
    "first.last@example.com",
    "first+acm@example.co.uk",
  ])("accepts a practical email address: %s", (email) => {
    expect(valueOf(email)).toBe(email);
  });

  it("trims and lowercases before validating", () => {
    expect(valueOf("  Student.Name+ACM@UFL.EDU  ")).toBe(
      "student.name+acm@ufl.edu",
    );
  });

  it.each([
    "",
    "   ",
    "hello@",
    "@example.com",
    "a@@b.com",
    "user@example",
    "user name@example.com",
    "user@exam ple.com",
  ])("rejects an invalid address: %j", (email) => {
    expect(validateEmail(email).ok).toBe(false);
  });

  it.each([null, undefined, 42, true, {}, []])(
    "rejects a non-string input: %j",
    (input) => {
      expect(validateEmail(input).ok).toBe(false);
    },
  );

  it("accepts an address at the maximum length", () => {
    const domain = `${"b".repeat(61)}.${"c".repeat(61)}.${"d".repeat(61)}.com`;
    const email = `${"a".repeat(64)}@${domain}`;
    expect(email).toHaveLength(EMAIL_MAX_LENGTH);
    expect(validateEmail(email).ok).toBe(true);
  });

  it("rejects an address over the maximum length", () => {
    const domain = `${"b".repeat(62)}.${"c".repeat(61)}.${"d".repeat(61)}.com`;
    const email = `${"a".repeat(64)}@${domain}`;
    expect(email).toHaveLength(EMAIL_MAX_LENGTH + 1);
    expect(validateEmail(email).ok).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { membershipThreshold, resolveMembership, DEFAULT_THRESHOLD } from "./membership";

describe("membershipThreshold", () => {
  it("returns per-org threshold", () => expect(membershipThreshold("ACM")).toBe(3));
  it("matches the lowercase slug stored in the DB", () =>
    expect(membershipThreshold("acm")).toBe(3));
  it("falls back to default for unknown org", () =>
    expect(membershipThreshold("nope")).toBe(DEFAULT_THRESHOLD));
});

describe("resolveMembership", () => {
  it("active status is a member regardless of count", () => {
    expect(resolveMembership("member", "active", 0, "ACM"))
      .toEqual({ threshold: 3, isMember: true, remaining: 3 });
  });
  it("non-active becomes member once count reaches threshold", () => {
    expect(resolveMembership(null, "pending", 3, "ACM"))
      .toEqual({ threshold: 3, isMember: true, remaining: 0 });
  });
  it("non-member shows remaining", () => {
    expect(resolveMembership(null, null, 1, "ACM"))
      .toEqual({ threshold: 3, isMember: false, remaining: 2 });
  });
});

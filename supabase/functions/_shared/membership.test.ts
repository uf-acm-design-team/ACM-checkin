import { describe, it, expect } from "vitest";
import { DEFAULT_MEMBERSHIP_THRESHOLD, membershipThreshold, resolveMembership } from "./membership";

describe("membershipThreshold", () => {
  it("returns per-org threshold", () => expect(membershipThreshold("ACM")).toBe(3));
  it("matches the lowercase slug stored in the DB", () =>
    expect(membershipThreshold("acm")).toBe(3));
  it("gives an org with no override the default, so a new org works like the rest", () =>
    expect(membershipThreshold("nope")).toBe(DEFAULT_MEMBERSHIP_THRESHOLD));
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

  describe("org with no override (the default threshold)", () => {
    it("counts toward membership like any other org", () => {
      expect(resolveMembership(null, "pending", 2, "nope"))
        .toEqual({ threshold: 3, isMember: false, remaining: 1 });
      expect(resolveMembership(null, "pending", 3, "nope"))
        .toEqual({ threshold: 3, isMember: true, remaining: 0 });
    });
    it("an explicit active status still grants membership", () => {
      expect(resolveMembership(null, "active", 0, "nope"))
        .toEqual({ threshold: 3, isMember: true, remaining: 3 });
    });
  });
});

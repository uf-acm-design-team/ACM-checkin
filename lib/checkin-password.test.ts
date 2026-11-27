import { describe, expect, it } from "vitest";
import { checkinPasswordMatches, normalizeCheckinPassword } from "./checkin-password";

describe("checkinPasswordMatches", () => {
  it.each(["ACM2026", "acm2026", " Acm2026 ", "\tACM2026\n", "  aCm2026"])(
    "accepts %j for ACM2026",
    (given) => {
      expect(checkinPasswordMatches("ACM2026", given)).toBe(true);
    },
  );

  it("ignores case and spaces in the stored value too", () => {
    expect(checkinPasswordMatches(" acm2026 ", "ACM2026")).toBe(true);
  });

  it.each(["ACM2025", "acm 2026", "ACM20266", "", "   "])("rejects %j for ACM2026", (given) => {
    expect(checkinPasswordMatches("ACM2026", given)).toBe(false);
  });

  it("rejects a missing password when one is set", () => {
    expect(checkinPasswordMatches("ACM2026", undefined)).toBe(false);
    expect(checkinPasswordMatches("ACM2026", null)).toBe(false);
  });

  it("accepts anything when the meeting has no password", () => {
    expect(checkinPasswordMatches(null, "whatever")).toBe(true);
    expect(checkinPasswordMatches("", undefined)).toBe(true);
  });

  it("keeps non-ASCII spaces, matching the SQL copy of the rule", () => {
    expect(normalizeCheckinPassword(" ACM2026")).toBe(" acm2026");
  });
});

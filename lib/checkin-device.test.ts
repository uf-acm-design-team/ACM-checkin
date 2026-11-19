import { describe, expect, it } from "vitest";
import { issueDeviceCookie, verifyDeviceCookie } from "./checkin-device";

describe("browser device identity", () => {
  it("issues independent signed UUIDs that verify with the same server key", () => {
    const first = issueDeviceCookie("server-key");
    const second = issueDeviceCookie("server-key");
    expect(first).not.toBe(second);
    expect(verifyDeviceCookie(first, "server-key")).toBe(first.split(".")[0]);
  });

  it("rejects missing, unsigned, malformed and forged values without throwing", () => {
    const value = issueDeviceCookie("server-key");
    for (const invalid of [
      undefined, null, "", value.split(".")[0], value + ".extra",
      value.replace(/^./, value[0] === "a" ? "b" : "a"),
      value.split(".")[0] + "." + "?".repeat(43),
    ]) {
      expect(verifyDeviceCookie(invalid, "server-key")).toBeNull();
    }
    expect(verifyDeviceCookie(value, "different-key")).toBeNull();
    expect(verifyDeviceCookie(value, "")).toBeNull();
    expect(() => issueDeviceCookie("")).toThrow();
  });
});

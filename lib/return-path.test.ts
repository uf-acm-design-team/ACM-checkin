import { describe, it, expect } from "vitest";
import { checkinReturnPath, safeReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it.each([
    "/acm/checkin",
    "/dashboard",
    "/acm/checkin?meeting=1",
    "/",
  ])("accepts the same-site path %s", (path) => {
    expect(safeReturnPath(path)).toBe(path);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
    ["an empty string", ""],
    ["a relative path", "acm/checkin"],
    ["an absolute URL", "https://evil.com/acm/checkin"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a protocol-relative URL", "//evil.com"],
    ["a backslash host", "/\\evil.com"],
    ["a tab smuggling a second slash", "/\t/evil.com"],
    ["a newline", "/acm\n/checkin"],
  ])("rejects %s", (_label, value) => {
    expect(safeReturnPath(value)).toBeNull();
  });
});

describe("checkinReturnPath", () => {
  it("builds the org's check-in path", () => {
    expect(checkinReturnPath("acm")).toBe("/acm/checkin");
  });

  it("encodes the slug so it cannot escape the path", () => {
    expect(checkinReturnPath("a/b")).toBe("/a%2Fb/checkin");
  });

  it("always produces a path safeReturnPath accepts", () => {
    expect(safeReturnPath(checkinReturnPath("colorstack"))).toBe("/colorstack/checkin");
  });
});

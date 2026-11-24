import { describe, expect, it } from "vitest";
import { checkinReturnPath } from "./checkin-return";

describe("checkinReturnPath", () => {
  it.each(["/acm/checkin", "/acm-uf/checkin", "/color_stack/checkin", "/ACM2/checkin"])(
    "accepts the check-in page %s",
    (path) => {
      expect(checkinReturnPath(path)).toBe(path);
    },
  );

  it.each([
    ["missing", null],
    ["undefined", undefined],
    ["empty", ""],
    ["absolute URL", "https://evil.example/acm/checkin"],
    ["protocol-relative", "//evil.example/checkin"],
    ["backslash host", "/\\evil.example/checkin"],
    ["another route", "/acm/admin-dashboard"],
    ["nested path", "/acm/checkin/states-preview"],
    ["with a query", "/acm/checkin?x=1"],
    ["with a fragment", "/acm/checkin#x"],
    ["dot segments", "/../checkin"],
    ["encoded slash", "/acm%2F..%2Fx/checkin"],
    ["trailing slash", "/acm/checkin/"],
    ["control character", "/acm\n/checkin"],
  ])("rejects %s", (_label, value) => {
    expect(checkinReturnPath(value)).toBeNull();
  });
});

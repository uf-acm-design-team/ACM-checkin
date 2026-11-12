import { describe, expect, it } from "vitest";

import { escapeLikePattern, hasUnescapableWildcard, sameEmail } from "./email-match";

/**
 * What the database does with `.ilike("email", pattern)`: PostgREST rewrites
 * `*` to `%`, then Postgres ILIKE applies `%`/`_` wildcards with `\` as the
 * escape character, case-insensitively.
 */
function ilikeMatches(value: string, pattern: string): boolean {
  const sql = pattern.replace(/\*/g, "%");
  let re = "";
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "\\" && i + 1 < sql.length) re += sql[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (c === "%") re += "[\\s\\S]*";
    else if (c === "_") re += "[\\s\\S]";
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i").test(value);
}

describe("escapeLikePattern", () => {
  it("escapes backslash, percent and underscore", () => {
    expect(escapeLikePattern("a\\b%c_d")).toBe("a\\\\b\\%c\\_d");
  });

  it("leaves ordinary emails unchanged", () => {
    expect(escapeLikePattern("ada.lovelace+acm@ufl.edu")).toBe("ada.lovelace+acm@ufl.edu");
  });

  it("an email containing _ only matches itself", () => {
    const pattern = escapeLikePattern("john_doe@gmail.com");
    expect(ilikeMatches("john_doe@gmail.com", pattern)).toBe(true);
    expect(ilikeMatches("johnxdoe@gmail.com", pattern)).toBe(false);
    expect(ilikeMatches("john__doe@gmail.com", pattern)).toBe(false);
  });

  it("an email containing % only matches itself", () => {
    const pattern = escapeLikePattern("50%off@gmail.com");
    expect(ilikeMatches("50%off@gmail.com", pattern)).toBe(true);
    expect(ilikeMatches("50off@gmail.com", pattern)).toBe(false);
    expect(ilikeMatches("50-anything-off@gmail.com", pattern)).toBe(false);
  });

  it("an email containing a backslash only matches itself", () => {
    const pattern = escapeLikePattern("a\\_b@gmail.com");
    expect(ilikeMatches("a\\_b@gmail.com", pattern)).toBe(true);
    expect(ilikeMatches("a\\xb@gmail.com", pattern)).toBe(false);
  });

  it("still matches case-insensitively", () => {
    expect(ilikeMatches("Ada@UFL.edu", escapeLikePattern("ada@ufl.edu"))).toBe(true);
  });

  it("cannot neutralise * (PostgREST rewrites it), which hasUnescapableWildcard flags", () => {
    const email = "a*b@gmail.com";
    expect(ilikeMatches("axxb@gmail.com", escapeLikePattern(email))).toBe(true);
    expect(hasUnescapableWildcard(email)).toBe(true);
    expect(hasUnescapableWildcard("john_doe@gmail.com")).toBe(false);
  });
});

describe("sameEmail", () => {
  it("is exact and case-insensitive", () => {
    expect(sameEmail("Ada@UFL.edu", "ada@ufl.edu")).toBe(true);
    expect(sameEmail("johnxdoe@gmail.com", "john_doe@gmail.com")).toBe(false);
    expect(sameEmail("axxb@gmail.com", "a*b@gmail.com")).toBe(false);
  });

  it("never matches a missing value", () => {
    expect(sameEmail(null, "a@b.c")).toBe(false);
    expect(sameEmail("", "")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { buildCheckinLink } from "./checkin-link";

describe("buildCheckinLink", () => {
  it("builds origin/slug/checkin", () => {
    expect(buildCheckinLink("acm", "http://localhost:3000")).toBe(
      "http://localhost:3000/acm/checkin",
    );
  });

  it("uses whatever origin it is given", () => {
    // A printed QR must encode the production host, not the one that rendered it.
    expect(buildCheckinLink("acm", "https://checkin.example.com")).toBe(
      "https://checkin.example.com/acm/checkin",
    );
  });

  it("strips a trailing slash from the origin", () => {
    expect(buildCheckinLink("acm", "https://checkin.example.com/")).toBe(
      "https://checkin.example.com/acm/checkin",
    );
  });

  it("strips repeated trailing slashes from the origin", () => {
    expect(buildCheckinLink("acm", "https://checkin.example.com//")).toBe(
      "https://checkin.example.com/acm/checkin",
    );
  });

  it("encodes characters that would otherwise break the path", () => {
    // Unencoded, the "/" would add a path segment and "?" would start a query.
    expect(buildCheckinLink("a b/c?", "https://x.com")).toBe(
      "https://x.com/a%20b%2Fc%3F/checkin",
    );
  });

  it("leaves an ordinary hyphenated slug unchanged", () => {
    expect(buildCheckinLink("color-stack", "https://x.com")).toBe(
      "https://x.com/color-stack/checkin",
    );
  });
});

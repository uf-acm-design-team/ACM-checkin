import { describe, it, expect } from "vitest";
import { parseRichText, hasLinks, type TextSegment } from "./rich-text";

// Most assertions care about the shape of the split, not the exact objects.
const kinds = (segments: TextSegment[]) => segments.map((s) => s.type);
const links = (segments: TextSegment[]) =>
  segments.filter((s) => s.type === "link").map((s) => s.href);

describe("parseRichText", () => {
  it("returns nothing for empty input", () => {
    expect(parseRichText("")).toEqual([]);
  });

  it("returns a single text segment when there is no URL", () => {
    expect(parseRichText("How did you hear about us?")).toEqual([
      { type: "text", value: "How did you hear about us?" },
    ]);
  });

  it("preserves newlines inside text rather than splitting on them", () => {
    // Line breaks are CSS's job (whitespace-pre-line); the parser must not
    // silently eat them or the multi-line label renders as one run-on line.
    const segments = parseRichText("Follow our socials!\n\nSee you there.");
    expect(segments).toEqual([
      { type: "text", value: "Follow our socials!\n\nSee you there." },
    ]);
  });

  it("linkifies an https URL", () => {
    const segments = parseRichText("https://instagram.com/ufacm");
    expect(segments).toEqual([
      {
        type: "link",
        value: "https://instagram.com/ufacm",
        href: "https://instagram.com/ufacm",
      },
    ]);
  });

  it("gives a bare www. host an https scheme", () => {
    // Without this the href resolves relative to the check-in page.
    expect(links(parseRichText("www.instagram.com/ufacm"))).toEqual([
      "https://www.instagram.com/ufacm",
    ]);
  });

  it("splits text around a URL", () => {
    const segments = parseRichText("Follow us at https://ufacm.org today");
    expect(kinds(segments)).toEqual(["text", "link", "text"]);
    expect(segments[0]).toEqual({ type: "text", value: "Follow us at " });
    expect(segments[2]).toEqual({ type: "text", value: " today" });
  });

  it("finds every URL on its own line", () => {
    const segments = parseRichText(
      "Follow our socials!\nhttps://instagram.com/ufacm\nhttps://discord.gg/ufacm",
    );
    expect(links(segments)).toEqual([
      "https://instagram.com/ufacm",
      "https://discord.gg/ufacm",
    ]);
  });

  it("does not swallow sentence punctuation after a URL", () => {
    const segments = parseRichText("Read https://ufacm.org.");
    expect(links(segments)).toEqual(["https://ufacm.org"]);
    expect(segments.at(-1)).toEqual({ type: "text", value: "." });
  });

  it("does not swallow an unbalanced closing paren", () => {
    const segments = parseRichText("(see https://ufacm.org)");
    expect(links(segments)).toEqual(["https://ufacm.org"]);
    expect(segments.at(-1)).toEqual({ type: "text", value: ")" });
  });

  it("keeps parens that the URL itself opened", () => {
    const url = "https://en.wikipedia.org/wiki/ACM_(disambiguation)";
    expect(links(parseRichText(url))).toEqual([url]);
  });

  // The security-relevant cases. parseRichText must never hand back an href
  // that a browser would treat as executable, and must never be a route for
  // markup to reach the page.
  it("does not linkify javascript: or data: URLs", () => {
    for (const hostile of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
    ]) {
      expect(hasLinks(hostile)).toBe(false);
      expect(parseRichText(hostile)).toEqual([{ type: "text", value: hostile }]);
    }
  });

  it("treats HTML in a label as literal text", () => {
    const markup = '<img src=x onerror="alert(1)">';
    expect(parseRichText(markup)).toEqual([{ type: "text", value: markup }]);
  });

  it("never emits an href outside http(s)", () => {
    const segments = parseRichText(
      "ok https://ufacm.org bad javascript:alert(1) also www.ufacm.org",
    );
    for (const href of links(segments)) {
      expect(href).toMatch(/^https?:\/\//);
    }
  });

  it("is not affected by the previous call's regex state", () => {
    // URL_PATTERN is a module-level /g regex, so a leaked lastIndex would make
    // results depend on call order.
    const once = parseRichText("https://ufacm.org");
    const twice = parseRichText("https://ufacm.org");
    expect(twice).toEqual(once);
  });
});

describe("hasLinks", () => {
  it("is false for plain prose and true when a URL is present", () => {
    expect(hasLinks("How did you hear about us?")).toBe(false);
    expect(hasLinks("Join https://discord.gg/ufacm")).toBe(true);
  });
});

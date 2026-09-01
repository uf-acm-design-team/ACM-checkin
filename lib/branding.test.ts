import { describe, it, expect } from "vitest";
import {
  contrastRatio,
  inkOn,
  hasLogo,
  resolveBranding,
  brandingToCssVars,
  cssVarsToStyle,
  DEFAULT_BRANDING,
} from "./branding";

describe("resolveBranding", () => {
  it("returns defaults for null/undefined/garbage", () => {
    expect(resolveBranding(null)).toEqual(DEFAULT_BRANDING);
    expect(resolveBranding(undefined)).toEqual(DEFAULT_BRANDING);
    expect(resolveBranding("garbage")).toEqual(DEFAULT_BRANDING);
    expect(resolveBranding(42)).toEqual(DEFAULT_BRANDING);
  });

  it("merges a partial object with defaults", () => {
    const result = resolveBranding({ colors: { primary: "#123456" } });
    expect(result.colors.primary).toBe("#123456");
    expect(result.colors.background).toBe(DEFAULT_BRANDING.colors.background);
    expect(result.colors.accent).toBe(DEFAULT_BRANDING.colors.accent);
    expect(result.particleColor).toBe(DEFAULT_BRANDING.particleColor);
    expect(result.logo.crest).toBe(DEFAULT_BRANDING.logo.crest);
  });

  it("falls back per-field on invalid hex but keeps valid siblings", () => {
    const result = resolveBranding({
      colors: { primary: "#abcdef", accent: "red", text: "#xyz" },
    });
    expect(result.colors.primary).toBe("#abcdef");
    expect(result.colors.accent).toBe(DEFAULT_BRANDING.colors.accent);
    expect(result.colors.text).toBe(DEFAULT_BRANDING.colors.text);
  });

  it("accepts 3-digit hex", () => {
    expect(resolveBranding({ colors: { primary: "#fff" } }).colors.primary).toBe(
      "#fff"
    );
  });

  it("handles non-object / array colors without throwing", () => {
    expect(() => resolveBranding({ colors: [] })).not.toThrow();
    expect(resolveBranding({ colors: "nope" }).colors).toEqual(
      DEFAULT_BRANDING.colors
    );
    expect(resolveBranding({ colors: 123 }).colors).toEqual(
      DEFAULT_BRANDING.colors
    );
  });
});

describe("brandingToCssVars", () => {
  it("emits the five accent-tier variables", () => {
    const css = brandingToCssVars(DEFAULT_BRANDING);
    for (const v of [
      "--accent",
      "--accent-deep",
      "--accent-soft",
      "--accent-ink",
      "--accent-on-soft",
    ]) {
      expect(css).toContain(v);
    }
  });

  it("only emits sanitized values (injection-safe)", () => {
    // The output is interpolated into a <style> tag by OrgTheme, so a stored
    // value that escaped validation would be script injection. resolveBranding
    // rejects the non-hex accent and the default is emitted instead.
    const b = resolveBranding({
      colors: { primary: "#abcdef", accent: "}</style><script>alert(1)" },
    });
    const css = brandingToCssVars(b);
    expect(css).toContain(`--accent:${DEFAULT_BRANDING.colors.accent}`);
    expect(css).not.toContain("<script>");
    expect(css).not.toContain("</style>");
  });

  it("emits nothing but hex values and token names", () => {
    // Belt and braces: every emitted value must be a hex literal, whatever was
    // stored. Anything else means a validation gap upstream.
    const css = brandingToCssVars(
      resolveBranding({ colors: { accent: "url(evil)" } }),
    );
    for (const decl of css.split(";")) {
      const [, value] = decl.split(":");
      expect(value).toMatch(/^#[0-9a-fA-F]{3,6}$/);
    }
  });
});

describe("inkOn", () => {
  it("picks near-black on the default orange, which fails white at 3.0:1", () => {
    // The whole reason --accent-ink exists.
    expect(contrastRatio("#FA4616", "#FFFFFF")).toBeLessThan(4.5);
    expect(inkOn("#FA4616")).toBe("#1A0800");
  });

  it("picks white on dark/saturated actions", () => {
    expect(inkOn("#0021A5")).toBe("#FFFFFF"); // UF blue
    expect(inkOn("#4C1D95")).toBe("#FFFFFF"); // ColorStack deep purple
  });

  it("picks near-black on light actions", () => {
    expect(inkOn("#FFFFFF")).toBe("#1A0800");
    expect(inkOn("#FDE047")).toBe("#1A0800");
  });

  it("always clears 4.5:1 with the ink it chose", () => {
    for (const c of ["#FA4616", "#0021A5", "#4C1D95", "#FDE047", "#22C55E", "#EC4899"]) {
      expect(contrastRatio(c, inkOn(c))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("handles 3-digit hex", () => {
    expect(inkOn("#fff")).toBe("#1A0800");
    expect(inkOn("#000")).toBe("#FFFFFF");
  });
});

describe("brandingToCssVars — the accent tier", () => {
  // Only the accent is emitted. Surfaces, the text ramp and the semantic tones
  // are fixed by the design system, so a club cannot make its own error states
  // unreadable -- and an officer sees one consistent console across orgs.

  it("emits the accent tier and nothing else", () => {
    const css = brandingToCssVars(DEFAULT_BRANDING);
    expect(css).toContain("--accent:#FA4616");
    expect(css).toContain("--accent-deep:");
    expect(css).toContain("--accent-soft:");
    expect(css).toContain("--accent-on-soft:");
    // The surface/background tokens are no longer per-org.
    expect(css).not.toContain("--brand-background");
    expect(css).not.toContain("--surface-ink");
    expect(css).not.toContain("--particle-color");
  });

  it("derives a readable ink for text sitting on the accent", () => {
    // Mid-chroma orange only makes 3.0:1 against white, so it gets near-black.
    expect(brandingToCssVars(DEFAULT_BRANDING)).toContain("--accent-ink:#1A0800");

    // A deep purple gets white.
    const purple = resolveBranding({ colors: { accent: "#4C1D95" } });
    expect(brandingToCssVars(purple)).toContain("--accent-ink:#FFFFFF");
  });

  it("derives deep and soft tiers from the stored accent", () => {
    const css = brandingToCssVars(resolveBranding({ colors: { accent: "#4C1D95" } }));
    // Deep is darker than the accent; soft is nearly white.
    expect(css).toContain("--accent-deep:#3e187a");
    expect(css).toContain("--accent-soft:#f1edf7");
  });

  it("keeps --accent-on-soft readable against the soft tint it pairs with", () => {
    // The soft tier is a 92%-white mix, so text at the raw accent often fails
    // on it. --accent-on-soft is darkened until it clears AA.
    for (const accent of ["#FA4616", "#4C1D95", "#0021A5", "#22C55E", "#EC4899"]) {
      const css = brandingToCssVars(resolveBranding({ colors: { accent } }));
      const soft = /--accent-soft:(#[0-9a-fA-F]{6})/.exec(css)![1];
      const onSoft = /--accent-on-soft:(#[0-9a-fA-F]{6})/.exec(css)![1];
      expect(contrastRatio(soft, onSoft)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("produces valid 6-digit hex for every derived token", () => {
    const css = brandingToCssVars(resolveBranding({ colors: { accent: "#000" } }));
    for (const token of ["--accent-deep", "--accent-soft", "--accent-on-soft"]) {
      const value = new RegExp(`${token}:(#[0-9a-fA-F]{6})`).exec(css);
      expect(value, `${token} should be a 6-digit hex`).not.toBeNull();
    }
  });
});

describe("cssVarsToStyle", () => {
  // Used where several orgs render on ONE page (the dashboard cards, the
  // developer org list), so the accent can't live on :root.

  it("round-trips every token brandingToCssVars emits", () => {
    const style = cssVarsToStyle(brandingToCssVars(DEFAULT_BRANDING)) as Record<
      string,
      string
    >;
    expect(style["--accent"]).toBe(DEFAULT_BRANDING.colors.accent);
    for (const token of [
      "--accent-deep",
      "--accent-soft",
      "--accent-ink",
      "--accent-on-soft",
    ]) {
      expect(style[token]).toMatch(/^#[0-9a-fA-F]{3,6}$/);
    }
  });

  it("keeps hex values intact rather than splitting on their colon-free parts", () => {
    // A naive split(":") would work here, but guard the shape explicitly: the
    // value must survive whole, '#' included.
    const style = cssVarsToStyle("--accent:#123456") as Record<string, string>;
    expect(style["--accent"]).toBe("#123456");
  });

  it("ignores malformed declarations instead of producing empty keys", () => {
    const style = cssVarsToStyle("--accent:#fff;;garbage;--accent-ink:#000") as Record<
      string,
      string
    >;
    expect(style["--accent"]).toBe("#fff");
    expect(style["--accent-ink"]).toBe("#000");
    expect(Object.keys(style)).toHaveLength(2);
  });
});

describe("logo defaults to empty, never another org's crest", () => {
  // An org that has uploaded no logo must show NO logo. Falling back to
  // /acm-logo.png made every new club wear ACM's crest.

  it("resolves a missing logo to empty strings", () => {
    expect(resolveBranding({}).logo).toEqual({ crest: "", wordmark: "" });
    expect(resolveBranding(null).logo).toEqual({ crest: "", wordmark: "" });
  });

  it("treats a blank or whitespace logo as absent", () => {
    const result = resolveBranding({ logo: { crest: "", wordmark: "   " } });
    expect(result.logo.crest).toBe("");
    expect(result.logo.wordmark).toBe("");
  });

  it("keeps a real uploaded URL and trims it", () => {
    const url = "https://x.supabase.co/storage/v1/object/public/org-logos/acm/crest-1.png";
    expect(resolveBranding({ logo: { crest: `  ${url}  ` } }).logo.crest).toBe(url);
  });

  it("resolves each logo slot independently", () => {
    const result = resolveBranding({ logo: { crest: "/x.png" } });
    expect(result.logo.crest).toBe("/x.png");
    expect(result.logo.wordmark).toBe("");
  });

  it("ships no logo in DEFAULT_BRANDING", () => {
    expect(DEFAULT_BRANDING.logo.crest).toBe("");
    expect(DEFAULT_BRANDING.logo.wordmark).toBe("");
  });
});

describe("hasLogo", () => {
  it("is false for empty and whitespace", () => {
    expect(hasLogo("")).toBe(false);
    expect(hasLogo("   ")).toBe(false);
  });

  it("is true for a real path or URL", () => {
    expect(hasLogo("/acm-logo.png")).toBe(true);
    expect(hasLogo("https://x.supabase.co/storage/v1/object/public/org-logos/a/b.png")).toBe(true);
  });

  it("guards the render sites -- an empty src would refetch the page as an image", () => {
    expect(hasLogo(resolveBranding({}).logo.crest)).toBe(false);
  });
});

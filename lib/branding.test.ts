import { describe, it, expect } from "vitest";
import {
  contrastRatio,
  inkOn,
  resolveBranding,
  brandingToCssVars,
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
  it("emits all six CSS variables", () => {
    const css = brandingToCssVars(DEFAULT_BRANDING);
    for (const v of [
      "--brand-primary",
      "--brand-background",
      "--brand-background-secondary",
      "--brand-action",
      "--text-main",
      "--particle-color",
    ]) {
      expect(css).toContain(v);
    }
  });

  it("only emits sanitized values (injection-safe)", () => {
    const b = resolveBranding({
      colors: { primary: "#abcdef", accent: "}</style><script>alert(1)" },
    });
    const css = brandingToCssVars(b);
    expect(css).toContain("--brand-primary:#abcdef");
    expect(css).toContain(`--brand-action:${DEFAULT_BRANDING.colors.accent}`);
    expect(css).not.toContain("<script>");
    expect(css).not.toContain("</style>");
  });
});

describe("inkOn", () => {
  it("picks near-black on the default orange, which fails white at 3.0:1", () => {
    // The whole reason --brand-action-ink exists.
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

describe("brandingToCssVars — derived tokens", () => {
  it("emits action-ink and surface-ink", () => {
    const css = brandingToCssVars(DEFAULT_BRANDING);
    expect(css).toContain("--brand-action-ink:#1A0800");
    expect(css).toContain("--surface-ink:#FFFFFF");
  });

  it("derives from the org's stored accent, not the default", () => {
    const b = resolveBranding({
      colors: { accent: "#4C1D95", background: "#FFFFFF" },
    });
    const css = brandingToCssVars(b);
    expect(css).toContain("--brand-action-ink:#FFFFFF");
    // A light stored background flips the public surface ink to near-black.
    expect(css).toContain("--surface-ink:#1A0800");
  });
});

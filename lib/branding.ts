import type { CSSProperties } from "react";

// Per-organization branding template.
//
// Each org row carries a `branding` jsonb column shaped like `Branding`. Any
// missing or malformed field falls back to the default ACM theme below, so
// `resolveBranding` always returns a fully-populated object and never throws.

export type Branding = {
  colors: {
    primary: string;
    background: string;
    backgroundSecondary: string;
    accent: string;
    text: string;
  };
  particleColor: string;
  logo: {
    crest: string;
    wordmark: string;
  };
};

// Default ACM theme — the fallback for non-org pages and missing branding.
// Mirrored by the :root defaults in app/globals.css.
export const DEFAULT_BRANDING: Branding = {
  colors: {
    primary: "#FA4616", // UF/ACM orange — gradient top, headings, accents
    background: "#0021A5", // UF blue — gradient bottom / base background
    backgroundSecondary: "#001B87", // darker blue — cards/panels
    accent: "#FA4616", // buttons/actions
    text: "#FFFFFF", // main text/foreground
  },
  particleColor: "#FFFFFF", // particle dots + connecting lines
  // Empty by default: an org that has not uploaded a logo shows NO logo, not
  // ACM's. Falling back to /acm-logo.png meant every new club silently wore
  // another club's crest on its landing page, nav and admin sidebar -- which
  // reads as a bug, and misrepresents the org. Callers must treat "" as "no
  // logo" and render nothing; see hasLogo().
  logo: {
    crest: "",
    wordmark: "",
  },
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Ink colors for the two derived contrast tokens. Near-black rather than pure
// black: on a mid-chroma action colour (orange, amber, lime) #1A0800 reads as
// intentional type rather than a hole punched in the button.
const INK_DARK = "#1A0800";
const INK_LIGHT = "#FFFFFF";

/** Expand #abc to #aabbcc and return the r/g/b bytes. Assumes HEX-validated input. */
function toRgb(value: string): [number, number, number] {
  let h = value.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance (sRGB, D65). */
function luminance(value: string): number {
  const channel = (byte: number) => {
    const c = byte / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = toRgb(value);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two hex colors. Always >= 1. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Pick the readable text colour to sit on `surface`.
 *
 * This is the one token an officer never chooses. Mid-chroma brand colours are
 * the trap: UF orange (#FA4616) against white is only 3.0:1 — under the 4.5:1
 * AA threshold for the button labels it gets used for — while the same orange
 * against near-black clears it comfortably. Picking the higher-contrast of the
 * two inks means a club can store any accent hex and still get a legible
 * button, instead of the branding tab having to police their palette.
 */
export function inkOn(surface: string): string {
  return contrastRatio(surface, INK_LIGHT) >= contrastRatio(surface, INK_DARK)
    ? INK_LIGHT
    : INK_DARK;
}

const hex = (value: unknown, fallback: string): string =>
  typeof value === "string" && HEX.test(value) ? value : fallback;

// A logo URL, or "" when absent. Unlike the colour tokens there is no sensible
// non-empty default -- see DEFAULT_BRANDING.logo.
const logoUrl = (value: unknown): string =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : "";

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Parse arbitrary stored branding JSON into a fully-populated Branding. Never throws. */
export function resolveBranding(raw: unknown): Branding {
  const root = asObject(raw);
  const colors = asObject(root.colors);
  const logo = asObject(root.logo);
  const D = DEFAULT_BRANDING;
  return {
    colors: {
      primary: hex(colors.primary, D.colors.primary),
      background: hex(colors.background, D.colors.background),
      backgroundSecondary: hex(
        colors.backgroundSecondary,
        D.colors.backgroundSecondary
      ),
      accent: hex(colors.accent, D.colors.accent),
      text: hex(colors.text, D.colors.text),
    },
    particleColor: hex(root.particleColor, D.particleColor),
    logo: {
      crest: logoUrl(logo.crest),
      wordmark: logoUrl(logo.wordmark),
    },
  };
}

/** Expand a validated 3- or 6-digit hex to the canonical 6-digit form. */
function normalizeHex(value: string): string {
  const [r, g, b] = toRgb(value);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Darken a hex colour toward black by `amount` (0..1).
 *
 * Used to derive the pressed/hover tier (--accent-deep) from an org's stored
 * accent. Orgs store one accent, not a ramp, so the second stop has to be
 * computed -- and computing it by mixing toward black keeps hue and lets any
 * stored colour produce a usable hover state.
 */
function darken(value: string, amount: number): string {
  const [r, g, b] = toRgb(value);
  const mix = (c: number) =>
    Math.round(c * (1 - amount))
      .toString(16)
      .padStart(2, "0");
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

/**
 * Lighten a hex colour toward white by `amount` (0..1).
 *
 * Derives --accent-soft, the tinted field behind chips and identity tiles. A
 * heavy mix (the caller passes ~0.92) is deliberate: the wireframe's soft tier
 * is nearly white, so text at --accent-on-soft stays readable on it.
 */
function lighten(value: string, amount: number): string {
  const [r, g, b] = toRgb(value);
  const mix = (c: number) =>
    Math.round(c + (255 - c) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

/**
 * Render a Branding's accent as a `;`-joined CSS-variable string.
 *
 * Only the accent tier is emitted. The surfaces, text ramp and semantic tones
 * are fixed by the design system (app/globals.css) and are NOT per-org: an
 * officer moving between clubs should get one consistent console, and a
 * warning must not turn purple because a club stored purple. A club's identity
 * lives in the accent, the crest, and the name.
 *
 * These are applied on the check-in route only -- see OrgTheme.
 */
export function brandingToCssVars(b: Branding): string {
  const accent = b.colors.accent;
  const soft = lighten(accent, 0.92);
  return [
    `--accent:${accent}`,
    `--accent-deep:${darken(accent, 0.18)}`,
    `--accent-soft:${soft}`,
    // Derived, never stored: the readable ink for text sitting ON the accent.
    // See inkOn() for why this can't be a fixed white.
    `--accent-ink:${inkOn(accent)}`,
    // Text on the soft tint, darkened until it actually clears AA against it.
    `--accent-on-soft:${readableOn(soft, accent)}`,
  ].join(";");
}

/**
 * Turn a `brandingToCssVars` string into a React inline-style object.
 *
 * The `;`-joined form is what a <style> tag wants; a React `style` prop wants
 * `{ "--accent": "#..." }`. Needed wherever several orgs appear on ONE page
 * (the dashboard's card list), since the tokens can't sit on :root there --
 * each element scopes its own club's accent to its own subtree.
 *
 * Values are validated hex from resolveBranding, so nothing here can inject.
 */
export function cssVarsToStyle(vars: string): CSSProperties {
  const style: Record<string, string> = {};
  for (const decl of vars.split(";")) {
    const at = decl.indexOf(":");
    if (at === -1) continue;
    style[decl.slice(0, at)] = decl.slice(at + 1);
  }
  return style as CSSProperties;
}

/**
 * Darken `color` until it clears 4.5:1 against `surface`.
 *
 * A fixed darkening ratio is not enough: --accent-soft is a 92%-white mix, so a
 * bright accent (lime, cyan, mid-green) is still too light against it after a
 * flat 30% cut, and the chip label lands somewhere around 4.1:1. Stepping down
 * until the ratio is actually met means any stored accent yields a legible
 * label instead of the branding tab having to police the palette.
 *
 * Terminates: each step darkens by 8% of the remaining distance to black, and
 * black clears 4.5:1 against a near-white surface well before the cap.
 */
function readableOn(surface: string, color: string): string {
  // Normalized up front so the emitted token is always 6-digit, even when the
  // stored accent was written as #abc and already clears the threshold.
  let candidate = normalizeHex(color);
  for (let i = 0; i < 24 && contrastRatio(surface, candidate) < 4.5; i++) {
    candidate = darken(candidate, 0.08);
  }
  return candidate;
}

/**
 * Whether a resolved logo URL points at an actual image.
 *
 * The same empty-string contract is applied by the `Identity` tile in
 * components/ui/primitives.tsx, which every crest now renders through: an empty
 * crest falls back to the org's monogram rather than showing a broken image or
 * another club's logo.
 */
export function hasLogo(url: string): boolean {
  return url.trim().length > 0;
}

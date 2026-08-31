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

/** Render a Branding's colors as a `;`-joined :root CSS-variable string. */
export function brandingToCssVars(b: Branding): string {
  const c = b.colors;
  return [
    `--brand-primary:${c.primary}`,
    `--brand-background:${c.background}`,
    `--brand-background-secondary:${c.backgroundSecondary}`,
    `--brand-action:${c.accent}`,
    // Derived, never stored: the readable ink for text sitting ON the action
    // colour. See inkOn() for why this can't be a fixed white.
    `--brand-action-ink:${inkOn(c.accent)}`,
    `--text-main:${c.text}`,
    // Same derivation for the branded surface. A club whose text token is dark
    // is really asking for a light public surface, and the check-in card's
    // hairlines/muted text have to flip with it rather than staying white-alpha.
    `--surface-ink:${inkOn(c.background)}`,
    `--particle-color:${b.particleColor}`,
  ].join(";");
}

/** Whether a resolved logo URL points at an actual image. */
export function hasLogo(url: string): boolean {
  return url.trim().length > 0;
}

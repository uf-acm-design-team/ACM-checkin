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
  logo: {
    crest: "/acm-logo.png",
    wordmark: "/acm-logo.png",
  },
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const hex = (value: unknown, fallback: string): string =>
  typeof value === "string" && HEX.test(value) ? value : fallback;

const nonEmpty = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.length > 0 ? value : fallback;

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
      crest: nonEmpty(logo.crest, D.logo.crest),
      wordmark: nonEmpty(logo.wordmark, D.logo.wordmark),
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
    `--text-main:${c.text}`,
    `--particle-color:${b.particleColor}`,
  ].join(";");
}

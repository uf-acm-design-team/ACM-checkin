// Per-organization branding template. Shared by the web app (lib/branding.ts)
// and the create-org edge function, so a new org's defaults can't drift.
//
// Each org row carries a `branding` jsonb column shaped like `Branding`. Any
// missing or malformed field falls back to the default ACM theme below (see
// resolveBranding in lib/branding.ts).

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

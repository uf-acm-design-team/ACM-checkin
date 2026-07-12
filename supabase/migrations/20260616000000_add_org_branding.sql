-- Add per-organization branding template (colors, particle color, logo URLs).
ALTER TABLE "public"."organizations"
  ADD COLUMN IF NOT EXISTS "branding" jsonb;

COMMENT ON COLUMN "public"."organizations"."branding" IS
  'Per-org theming template: { colors: {primary, background, backgroundSecondary, accent, text}, particleColor, logo: {crest, wordmark} }. Missing/invalid values fall back to the default ACM theme in lib/branding.ts.';

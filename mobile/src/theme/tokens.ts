/**
 * The ACM Check-In design tokens, ported from the web app's `app/globals.css`.
 *
 * This file is the ONLY place a colour value may be written. Screens and
 * components import from `@/theme` and never use raw hex -- `npm run lint`
 * enforces that, and `tokens.test.ts` fails if these drift from globals.css.
 *
 * Same rules as web:
 * - One accent (the product purple), reserved for the primary action, the
 *   active state and identity. Everything else is neutral.
 * - good / warn / bad are fixed and never branded.
 * - Light surface only. There is deliberately no dark palette.
 */

export const colors = {
  // Accent -- the only chromatic tier.
  accent: '#7c3aed',
  accentDeep: '#6d28d9', // pressed state, inverted success surface
  accentSoft: '#f5f3ff', // tinted chips, identity tiles, active nav
  accentInk: '#ffffff', // text sitting ON accent
  accentOnSoft: '#6d28d9', // text sitting on accentSoft

  // Surfaces
  canvas: '#fafafa', // app background behind cards
  surface: '#ffffff', // cards, panels
  surfaceSunken: '#f4f4f5', // skeletons, track fills, inert chips

  // Slate text ramp
  ink: '#09090b', // headings, primary values
  inkStrong: '#3f3f46', // labels, secondary buttons
  inkMuted: '#71717a', // body copy, descriptions
  inkFaint: '#a1a1aa', // metadata, placeholders, captions

  // Lines
  line: '#e4e4e7', // default hairline
  lineSoft: '#f4f4f5', // internal dividers

  // Semantic tones: a surface, a border (line) and an ink each.
  good: '#16a34a',
  goodInk: '#15803d',
  goodSurface: '#f0fdf4',
  goodLine: '#bbf7d0',

  warn: '#d97706',
  warnInk: '#b45309',
  warnSurface: '#fffbeb',
  warnLine: '#fde68a',

  bad: '#dc2626',
  badInk: '#b91c1c',
  badSurface: '#fef2f2',
  badLine: '#fecaca',
} as const;

/** Corner radii in dp. Controls and cards are near-square; only pills round hard. */
export const radii = {
  control: 6,
  card: 8,
  panel: 10,
  phone: 22,
  pill: 99,
} as const;

/**
 * The system's single elevation. Web: `0 1px 2px rgba(9, 9, 11, 0.05)`
 * (card) and 0.06 (raised). shadowColor is the ink token.
 */
export const shadows = {
  card: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  raised: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
} as const;

/** A 4dp spacing scale (Tailwind's: space[4] === 16 === web `p-4`). */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
} as const;

export type ColorToken = keyof typeof colors;

import type { ColorToken } from './tokens';

/**
 * The dark palette: one value for every token in `tokens.ts`, same roles.
 *
 * Mobile-only for now. Web has no dark mode, so there is nothing in
 * globals.css to check these against; `tokens.ts` stays the light palette the
 * drift test compares with web. Surfaces are a neutral dark grey (not black)
 * and text flips to light; the accent
 * buttons keep their purple, since white text on them reads in both modes.
 */
export const darkColors: Record<ColorToken, string> = {
  accent: '#7c3aed',
  accentDeep: '#6d28d9',
  accentSoft: '#2e1065',
  accentInk: '#ffffff',
  accentOnSoft: '#c4b5fd',

  canvas: '#1a1a1a',
  surface: '#242424',
  surfaceSunken: '#2e2e2e',

  ink: '#fafafa',
  inkStrong: '#d4d4d4',
  inkMuted: '#a3a3a3',
  inkFaint: '#737373',

  line: '#3a3a3a',
  lineSoft: '#2e2e2e',

  good: '#22c55e',
  goodInk: '#86efac',
  goodSurface: '#052e16',
  goodLine: '#166534',

  warn: '#f59e0b',
  warnInk: '#fcd34d',
  warnSurface: '#451a03',
  warnLine: '#92400e',

  bad: '#ef4444',
  badInk: '#fca5a5',
  badSurface: '#450a0a',
  badLine: '#991b1b',
};

import type { ColorToken } from './tokens';

/**
 * The dark palette: one value for every token in `tokens.ts`, same roles.
 *
 * Mobile-only for now. Web has no dark mode, so there is nothing in
 * globals.css to check these against; `tokens.ts` stays the light palette the
 * drift test compares with web. Zinc surfaces and text flip; the accent
 * buttons keep their purple, since white text on them reads in both modes.
 */
export const darkColors: Record<ColorToken, string> = {
  accent: '#7c3aed',
  accentDeep: '#6d28d9',
  accentSoft: '#2e1065',
  accentInk: '#ffffff',
  accentOnSoft: '#c4b5fd',

  canvas: '#09090b',
  surface: '#18181b',
  surfaceSunken: '#27272a',

  ink: '#fafafa',
  inkStrong: '#d4d4d8',
  inkMuted: '#a1a1aa',
  inkFaint: '#71717a',

  line: '#3f3f46',
  lineSoft: '#27272a',

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

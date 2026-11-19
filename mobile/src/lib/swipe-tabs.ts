// Tabs you can swipe between, in footer order. Check in is left out: it is a
// full-screen scanner you open and close with a button, not a page in the row.
export const SWIPE_TABS = ['index', 'calendar'] as const;

const MIN_DISTANCE = 60;
const MIN_VELOCITY = 500;

/**
 * Which tab a horizontal swipe should land on, or null to stay put.
 * Swiping left (negative `translationX`) moves to the next tab, right to the
 * previous one. A short drag only counts if it was a quick flick.
 */
export function swipeTarget(current: string, translationX: number, velocityX: number): string | null {
  const index = SWIPE_TABS.findIndex((name) => name === current);
  if (index < 0) return null;
  const far = Math.abs(translationX) >= MIN_DISTANCE;
  const fast = Math.abs(velocityX) >= MIN_VELOCITY && Math.sign(velocityX) === Math.sign(translationX);
  if (!far && !fast) return null;
  const next = translationX < 0 ? index + 1 : index - 1;
  return SWIPE_TABS[next] ?? null;
}

/**
 * How far the pages follow a drag on `current`: only toward a neighbouring
 * tab, and never more than one page. Anything else (the scanner, an unknown
 * tab) doesn't move.
 */
export function clampDrag(current: string, translationX: number, width: number): number {
  const index = SWIPE_TABS.findIndex((name) => name === current);
  if (index < 0) return 0;
  const min = index < SWIPE_TABS.length - 1 ? -width : 0;
  const max = index > 0 ? width : 0;
  return Math.min(Math.max(translationX, min), max);
}

/**
 * A drag on the footer, turned into the matching page drag. Moving the
 * highlight one tab to the right moves the pages one page to the left.
 */
export function footerToPage(translationX: number, tabWidth: number, width: number): number {
  return tabWidth > 0 ? (-translationX * width) / tabWidth : 0;
}

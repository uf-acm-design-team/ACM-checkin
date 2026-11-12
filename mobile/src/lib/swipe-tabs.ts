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

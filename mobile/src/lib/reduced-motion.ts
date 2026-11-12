import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

// The phone's Reduce Motion setting. Read once when the app loads, so a screen
// knows the answer on its first render instead of starting an animation and
// then cancelling it, and kept current if the setting changes while open.
let reduced = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (next === reduced) return;
  reduced = next;
  listeners.forEach((listener) => listener());
}

void AccessibilityInfo.isReduceMotionEnabled()?.then(set, () => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', set);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when the user asked the system for less motion. Skip or shorten animations when it is. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => reduced);
}

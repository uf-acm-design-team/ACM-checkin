import { createContext, useContext, useMemo, type ComponentProps, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import type { Tabs } from 'expo-router';

import { haptic } from '@/lib/haptics';
import { clampDrag, swipeTarget } from '@/lib/swipe-tabs';

type PanGesture = ReturnType<typeof Gesture.Pan>;
type TabsLayoutProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['layout']>>[0];

/** How long a page takes to finish sliding after you let go (or tap a tab). */
export const PAGE_TRANSITION_MS = 280;
export const PAGE_EASING = Easing.out(Easing.cubic);

type Pager = {
  /** How far, in points, the pages are being dragged right now. 0 when still. */
  drag: Animated.Value;
  width: number;
  /** The page swipe, so the footer's own drag can take priority over it. */
  pagePan: PanGesture;
  /** Move the pages with a drag of `dx` points. */
  follow: (dx: number) => void;
  /** Let go: finish on the neighbouring tab, or slide back. */
  release: (dx: number, velocity: number) => void;
};

const PagerContext = createContext<Pager | null>(null);

/** The swipe state, for the footer. Null outside the tabs. */
export function usePager() {
  return useContext(PagerContext);
}

/**
 * Wraps the tab navigator so Home and Calendar sit side by side like pages:
 * a sideways drag moves them with your finger, showing part of the next one,
 * and letting go finishes the slide (or puts it back). The screens themselves
 * read `drag` through their sceneStyleInterpolator in (tabs)/_layout.tsx.
 *
 * The gesture only claims the touch after a clear horizontal move, and gives
 * up on a vertical one, so scrolling lists and pull-to-refresh keep working.
 */
export function SwipeTabs({
  state,
  navigation,
  children,
  drag,
  reduced,
}: TabsLayoutProps & { drag: Animated.Value; reduced: boolean; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const current = state.routes[state.index]?.name ?? '';

  const pager = useMemo<Pager>(() => {
    const follow = (dx: number) => drag.setValue(clampDrag(current, dx, width));
    const release = (dx: number, velocity: number) => {
      const target = swipeTarget(current, clampDrag(current, dx, width), velocity);
      if (target) {
        haptic.tick();
        navigation.navigate(target);
      }
      // Runs alongside the tab's own slide (same length), so the page keeps
      // moving from where your finger left it.
      Animated.timing(drag, {
        toValue: 0,
        duration: reduced ? 0 : PAGE_TRANSITION_MS,
        easing: PAGE_EASING,
        useNativeDriver: true,
      }).start();
    };
    const pagePan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-20, 20])
      .failOffsetY([-15, 15])
      .onUpdate((event) => follow(event.translationX))
      .onEnd((event) => release(event.translationX, event.velocityX));
    return { drag, width, pagePan, follow, release };
  }, [current, width, drag, navigation, reduced]);

  return (
    <PagerContext.Provider value={pager}>
      <GestureHandlerRootView style={styles.fill}>
        <GestureDetector gesture={pager.pagePan}>
          {/* The detector needs a real native view to attach to; without
              collapsable={false} React Native can flatten this one away. */}
          <View collapsable={false} style={styles.fill}>
            {children}
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    </PagerContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

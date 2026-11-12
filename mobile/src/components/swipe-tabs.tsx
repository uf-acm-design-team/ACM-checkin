import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import type { Tabs } from 'expo-router';

import { swipeTarget } from '@/lib/swipe-tabs';

type TabsLayoutProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['layout']>>[0];

/**
 * Wraps the tab navigator so a sideways swipe on any tab moves to the
 * neighbouring one. The footer follows on its own: it already slides its
 * highlight to whichever tab becomes focused.
 *
 * The gesture only claims the touch after a clear horizontal move, and gives
 * up on a vertical one, so scrolling lists and pull-to-refresh keep working.
 */
export function SwipeTabs({ state, navigation, children }: TabsLayoutProps) {
  const current = state.routes[state.index]?.name ?? '';

  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((event) => {
      const target = swipeTarget(current, event.translationX, event.velocityX);
      if (target) navigation.navigate(target);
    });

  return (
    <GestureHandlerRootView style={styles.fill}>
      <GestureDetector gesture={swipe}>{children as React.ReactElement}</GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

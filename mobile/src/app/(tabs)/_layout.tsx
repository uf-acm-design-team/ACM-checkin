import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Animated, useAnimatedValue, useWindowDimensions, type ColorValue } from 'react-native';

import { GlassTabBar, hasGlassTabBar } from '@/components/glass-tab-bar';
import { PAGE_EASING, PAGE_TRANSITION_MS, SwipeTabs } from '@/components/swipe-tabs';
import { useReducedMotion } from '@/lib/reduced-motion';
import { colors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    // React Native 0.88 widened ColorValue (null, numbers). The tab bar passes our
    // theme tokens straight through; on iOS those can be dynamic light/dark colours.
    return <Ionicons name={name} color={color as string} size={size} />;
  };
}

/** Signed-in tabs. Accent marks the active tab -- one of its three allowed jobs. */
export default function TabsLayout() {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  // How far a swipe is dragging the pages; read by both pages and the footer.
  const drag = useAnimatedValue(0);
  const duration = reduced ? 0 : PAGE_TRANSITION_MS;

  // Home and Calendar sit side by side one screen apart (progress -1, 0, 1) and
  // both follow the drag, so the next page slides in under your finger.
  const pageOptions = {
    animation: 'shift',
    transitionSpec: { animation: 'timing', config: { duration, easing: PAGE_EASING } },
    sceneStyleInterpolator: ({ current }: { current: { progress: Animated.AnimatedInterpolation<number> } }) => ({
      sceneStyle: {
        transform: [
          {
            translateX: Animated.add(
              current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-width, 0, width] }),
              drag,
            ),
          },
        ],
      },
    }),
  } as const;

  return (
    <Tabs
      // Keep every tab drawn, so a swipe can show the page it's heading to.
      detachInactiveScreens={false}
      // iOS 26 gets the floating glass footer; everything else keeps the standard bar.
      tabBar={hasGlassTabBar ? (props) => <GlassTabBar {...props} /> : undefined}
      // Swipe sideways to move between tabs.
      layout={(props) => <SwipeTabs {...props} drag={drag} reduced={reduced} />}
      screenOptions={{
        headerShown: false,
        // Draw Calendar up front too, so the first swipe already has it to show.
        lazy: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        sceneStyle: { backgroundColor: colors.canvas },
      }}>
      <Tabs.Screen name="index" options={{ ...pageOptions, title: 'Home', tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen
        name="calendar"
        options={{ ...pageOptions, title: 'Calendar', tabBarIcon: tabIcon('calendar-outline') }}
      />
      <Tabs.Screen
        name="check-in"
        options={{
          title: 'Check in',
          tabBarIcon: tabIcon('qr-code-outline'),
          // The footer's purple flood covers the switch, so the scanner just
          // appears. Off screen it sits two pages away, out of any swipe's view.
          animation: 'shift',
          transitionSpec: { animation: 'timing', config: { duration: 0 } },
          sceneStyleInterpolator: ({ current }) => ({
            sceneStyle: {
              transform: [
                { translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-2 * width, 0, 2 * width] }) },
              ],
            },
          }),
        }}
      />
    </Tabs>
  );
}

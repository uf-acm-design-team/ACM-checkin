import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { GlassTabBar, hasGlassTabBar } from '@/components/glass-tab-bar';
import { colors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    // React Native 0.88 widened ColorValue (null, numbers). The tab bar passes our
    // theme tokens, which are strings; anything else falls back to the default.
    return <Ionicons name={name} color={typeof color === 'string' ? color : undefined} size={size} />;
  };
}

/** Signed-in tabs. Accent marks the active tab -- one of its three allowed jobs. */
export default function TabsLayout() {
  return (
    <Tabs
      // iOS 26 gets the floating glass footer; everything else keeps the standard bar.
      tabBar={hasGlassTabBar ? (props) => <GlassTabBar {...props} /> : undefined}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        sceneStyle: { backgroundColor: colors.canvas },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendar', tabBarIcon: tabIcon('calendar-outline') }}
      />
      <Tabs.Screen
        name="check-in"
        options={{ title: 'Check in', tabBarIcon: tabIcon('qr-code-outline') }}
      />
      {/* Profile has no tab: the round button at the top right of Home and Calendar opens it. */}
      <Tabs.Screen name="profile" options={{ title: 'Profile', href: null }} />
    </Tabs>
  );
}

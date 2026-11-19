import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { Screen, ScreenContainer, screensEnabled } from 'react-native-screens';

// Stands in for expo-router's bottom-tabs ScreenFallback (metro.config.js
// points it here). The original hides every tab that isn't showing with
// display: none, even when the navigator is told to keep inactive tabs
// (detachInactiveScreens={false}). The swipe between Home and Calendar needs
// the neighbouring page drawn so it can slide in under your finger, so here a
// tab that isn't detached is a plain view. The tab layout moves it off screen.

type ScreenProps = ComponentProps<typeof View> & { enabled?: boolean; active?: 0 | 1 | 2 };

export function MaybeScreenContainer({ enabled, ...rest }: ComponentProps<typeof View> & { enabled?: boolean }) {
  return screensEnabled() ? <ScreenContainer enabled={enabled} {...rest} /> : <View {...rest} />;
}

export function MaybeScreen({ enabled, active, ...rest }: ScreenProps) {
  if (enabled && screensEnabled()) {
    return <Screen {...rest} enabled activityState={active} freezeOnBlur={false} />;
  }
  return <View {...rest} />;
}

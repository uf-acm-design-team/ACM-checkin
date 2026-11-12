import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useAnimatedValue,
  useWindowDimensions,
  View,
} from 'react-native';

import { haptic } from '@/lib/haptics';
import { useReducedMotion } from '@/lib/reduced-motion';
import { colors, radii, space } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
// expo-router doesn't export the tab bar's props type from its root.
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const BAR_HEIGHT = 60;
const PILL_PADDING = space[1];
const CLOSE_SIZE = 44;

/** Liquid glass needs iOS 26. Everywhere else the tabs keep the standard bar. */
export const hasGlassTabBar = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * Room a tab screen leaves under its scrolling content so the last item can
 * clear the floating bar. Zero with the standard bar, which sits below the screen.
 */
export const GLASS_TAB_BAR_SPACE = hasGlassTabBar ? BAR_HEIGHT + space[10] + space[4] : 0;

// The route that becomes the separate round button, the one Close goes back
// to, and each tab's icon.
const CHECK_IN = 'check-in';
const HOME = 'index';
const ICONS: Record<string, IconName> = {
  index: 'home-outline',
  calendar: 'calendar-outline',
  'check-in': 'qr-code-outline',
};

/**
 * The iOS 26 footer: the tabs share a floating glass pill, and Check in is its
 * own round accent button beside it. It floats over the screen, so content
 * scrolls behind the glass.
 *
 * Tapping Check in floods the screen with purple from the button, then the
 * scanner fades in over it, full screen with a Close button instead of the
 * footer. Closing runs it backwards. With Reduce Motion on it just switches.
 */
export function GlassTabBar({ state, descriptors, navigateToTab, insets }: BottomTabBarProps) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();

  const tabs = state.routes.map((route, index) => ({
    route,
    focused: state.index === index,
    label: descriptors[route.key].options.title ?? route.name,
  }));
  const pillTabs = tabs.filter((tab) => tab.route.name !== CHECK_IN);
  const checkIn = tabs.find((tab) => tab.route.name === CHECK_IN);
  const home = tabs.find((tab) => tab.route.name === HOME);
  const scanning = checkIn?.focused ?? false;
  const focusedIndex = pillTabs.findIndex((tab) => tab.focused);

  // The highlight behind the active tab slides to the tab you pick.
  const [pillWidth, setPillWidth] = useState(0);
  const tabWidth = pillTabs.length > 0 ? (pillWidth - PILL_PADDING * 2) / pillTabs.length : 0;
  const slide = useAnimatedValue(0);
  const pop = useAnimatedValue(1);
  useEffect(() => {
    if (focusedIndex < 0 || tabWidth <= 0) return;
    const target = focusedIndex * tabWidth;
    if (reduced) {
      slide.setValue(target);
      return;
    }
    // The picked tab's icon dips and springs back as the highlight arrives.
    pop.setValue(0.82);
    const animation = Animated.parallel([
      Animated.spring(slide, { toValue: target, useNativeDriver: true, speed: 18, bounciness: 7 }),
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 12 }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [focusedIndex, tabWidth, reduced, slide, pop]);

  // The purple flood: a circle centred on the Check in button, big enough to
  // cover the screen from there.
  const bottom = Math.max(insets.bottom, space[3]);
  const floodSize = 2 * Math.hypot(width, height);
  const flood = useAnimatedValue(0);
  const floodOpacity = useAnimatedValue(1);
  const [moving, setMoving] = useState(false);

  function openScanner() {
    if (!checkIn || moving) return;
    haptic.tap();
    if (reduced) {
      navigateToTab(checkIn.route.key);
      return;
    }
    setMoving(true);
    floodOpacity.setValue(1);
    Animated.timing(flood, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      navigateToTab(checkIn.route.key);
      Animated.timing(floodOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        flood.setValue(0);
        floodOpacity.setValue(1);
        setMoving(false);
      });
    });
  }

  function closeScanner() {
    if (!home || moving) return;
    if (reduced) {
      navigateToTab(home.route.key);
      return;
    }
    setMoving(true);
    flood.setValue(1);
    floodOpacity.setValue(0);
    Animated.timing(floodOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start(() => {
      navigateToTab(home.route.key);
      Animated.timing(flood, {
        toValue: 0,
        duration: 450,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setMoving(false));
    });
  }

  return (
    <View style={styles.layer} pointerEvents="box-none">
      {scanning ? (
        <Pressable
          onPress={closeScanner}
          accessibilityRole="button"
          accessibilityLabel="Close scanner"
          hitSlop={8}
          style={[styles.close, { top: insets.top + space[2] }]}
        >
          <GlassView style={styles.closeGlass} isInteractive>
            <Ionicons name="close" size={22} color={colors.ink} />
          </GlassView>
        </Pressable>
      ) : (
        <View style={[styles.bar, { bottom }]} accessibilityRole="tablist">
          <GlassView
            style={styles.pill}
            isInteractive
            onLayout={(event) => setPillWidth(event.nativeEvent.layout.width)}
          >
            {tabWidth > 0 && focusedIndex >= 0 ? (
              <Animated.View
                style={[styles.highlight, { width: tabWidth, transform: [{ translateX: slide }] }]}
              />
            ) : null}
            {pillTabs.map(({ route, focused, label }) => (
              <Pressable
                key={route.key}
                onPress={() => {
                  if (!focused) haptic.tick();
                  navigateToTab(route.key);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
                style={styles.tab}
              >
                <Animated.View style={focused ? { transform: [{ scale: pop }] } : undefined}>
                  <Ionicons name={ICONS[route.name]} size={22} color={focused ? colors.accent : colors.inkMuted} />
                </Animated.View>
                <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text>
              </Pressable>
            ))}
          </GlassView>
          {checkIn ? (
            <Pressable
              onPress={openScanner}
              accessibilityRole="tab"
              accessibilityState={{ selected: false }}
              accessibilityLabel={checkIn.label}
            >
              <GlassView style={styles.round} tintColor={colors.accent} isInteractive>
                <Ionicons name={ICONS[CHECK_IN]} size={26} color={colors.accentInk} />
              </GlassView>
            </Pressable>
          ) : null}
        </View>
      )}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.flood,
          {
            width: floodSize,
            height: floodSize,
            borderRadius: floodSize / 2,
            left: width - space[4] - BAR_HEIGHT / 2 - floodSize / 2,
            top: height - bottom - BAR_HEIGHT / 2 - floodSize / 2,
            opacity: floodOpacity,
            transform: [{ scale: flood }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Covers the screen so the flood can, but only its own controls take touches.
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  bar: {
    position: 'absolute',
    left: space[4],
    right: space[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    height: BAR_HEIGHT,
    padding: PILL_PADDING,
    borderRadius: BAR_HEIGHT / 2,
  },
  highlight: {
    position: 'absolute',
    top: PILL_PADDING,
    bottom: PILL_PADDING,
    left: PILL_PADDING,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    color: colors.inkMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  labelFocused: {
    color: colors.accent,
    fontWeight: '600',
  },
  round: {
    alignItems: 'center',
    justifyContent: 'center',
    width: BAR_HEIGHT,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
  },
  close: {
    position: 'absolute',
    left: space[4],
  },
  closeGlass: {
    alignItems: 'center',
    justifyContent: 'center',
    width: CLOSE_SIZE,
    height: CLOSE_SIZE,
    borderRadius: CLOSE_SIZE / 2,
  },
  flood: {
    position: 'absolute',
    backgroundColor: colors.accentDeep,
  },
});

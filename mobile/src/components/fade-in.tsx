import { useEffect, type ReactNode } from 'react';
import { Animated, Easing, useAnimatedValue, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@/lib/reduced-motion';

/**
 * Fades its children in while they rise a few points, once, when they first
 * appear. `delay` staggers a list. With Reduce Motion on they are simply there.
 */
export function FadeIn({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const shown = useAnimatedValue(0);

  useEffect(() => {
    if (reduced) {
      shown.setValue(1);
      return;
    }
    const animation = Animated.timing(shown, {
      toValue: 1,
      duration: 280,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduced, delay, shown]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: shown,
          transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

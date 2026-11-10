import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

export function AnimatedListHeight({ children }: { children: ReactNode }) {
  const [height] = useState(() => new Animated.Value(0));
  const [measured, setMeasured] = useState(false);

  useEffect(() => () => height.stopAnimation(), [height]);

  function onLayout({ nativeEvent: { layout } }: LayoutChangeEvent) {
    if (!measured) {
      height.setValue(layout.height);
      setMeasured(true);
      return;
    }
    Animated.timing(height, {
      toValue: layout.height,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }

  return (
    <Animated.View style={[styles.clip, measured && { height }]}>
      <View onLayout={onLayout}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});

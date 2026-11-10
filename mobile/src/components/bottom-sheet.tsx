import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated, Easing, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions,
  type LayoutChangeEvent, type StyleProp, type ViewStyle,
} from 'react-native';

import { colors } from '@/theme';

export function BottomSheet({
  children,
  onClose,
  backdropLabel,
  style,
}: {
  children: ReactNode;
  onClose: () => void;
  backdropLabel: string;
  style: StyleProp<ViewStyle>;
}) {
  const open = children != null;

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      {open ? (
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={backdropLabel} />
          <SlidingPanel style={style}>{children}</SlidingPanel>
        </View>
      ) : null}
    </Modal>
  );
}

function SlidingPanel({ children, style }: { children: ReactNode; style: StyleProp<ViewStyle> }) {
  const { height } = useWindowDimensions();
  const [translateY] = useState(() => new Animated.Value(height));
  const started = useRef(false);

  useEffect(() => () => translateY.stopAnimation(), [translateY]);

  function slideIn({ nativeEvent: { layout } }: LayoutChangeEvent) {
    if (started.current || layout.height === 0) return;
    started.current = true;
    translateY.setValue(layout.height);
    Animated.timing(translateY, {
      toValue: 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }

  return (
    <Animated.View
      style={[style, { transform: [{ translateY }] }]}
      accessibilityViewIsModal
      onLayout={slideIn}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', overflow: 'hidden' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.ink, opacity: 0.4 },
});

import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated, Easing, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions,
  type LayoutChangeEvent, type StyleProp, type ViewStyle,
} from 'react-native';

import { colors } from '@/theme';

type Props = {
  children: ((dismiss: () => void) => ReactNode) | null;
  onClose: () => void;
  backdropLabel: string;
  style: StyleProp<ViewStyle>;
};

export function BottomSheet({ children, ...props }: Props) {
  return children ? <OpenBottomSheet {...props}>{children}</OpenBottomSheet> : null;
}

function OpenBottomSheet({
  children, onClose, backdropLabel, style,
}: Omit<Props, 'children'> & { children: NonNullable<Props['children']> }) {
  const { height } = useWindowDimensions();
  const [translateY] = useState(() => new Animated.Value(height));
  const [panelHeight, setPanelHeight] = useState(0);
  const [closing, setClosing] = useState(false);
  const useNativeDriver = Platform.OS !== 'web';

  useEffect(() => () => translateY.stopAnimation(), [translateY]);

  function slideIn({ nativeEvent: { layout } }: LayoutChangeEvent) {
    if (layout.height === 0 || closing) return;
    setPanelHeight(layout.height);
    if (panelHeight !== 0) return;
    translateY.setValue(layout.height);
    Animated.timing(translateY, {
      toValue: 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver,
    }).start();
  }

  function dismiss() {
    if (closing) return;
    setClosing(true);
    if (panelHeight === 0) {
      onClose();
      return;
    }
    Animated.timing(translateY, {
      toValue: panelHeight,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={dismiss} accessibilityLabel={backdropLabel} />
        <Animated.View
          style={[style, { transform: [{ translateY }] }]}
          accessibilityViewIsModal
          onLayout={slideIn}
        >
          {children(dismiss)}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', overflow: 'hidden' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.ink, opacity: 0.4 },
});

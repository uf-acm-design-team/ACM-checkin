import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { Term } from '@/lib/terms';
import { colors, radii, shadows, space } from '@/theme';

type Props = {
  terms: Term[];
  selected: Term;
  onSelect: (term: Term) => void;
};

type Anchor = { top: number; right: number };

// The semester pill at the top of the history screen. Tapping it drops a menu
// of this academic year's semesters down from the pill.
export function SemesterPicker({ terms, selected, onSelect }: Props) {
  const pill = useRef<ComponentRef<typeof Pressable>>(null);
  const { width: windowWidth } = useWindowDimensions();
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const open = () => {
    pill.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ top: y + height + space[1], right: windowWidth - (x + width) });
    });
  };
  const close = () => setAnchor(null);

  return (
    <>
      <Pressable
        ref={pill}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`Semester: ${selected.label}. Change semester`}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
      >
        <Text style={styles.pillText}>{selected.label}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.inkMuted} />
      </Pressable>

      <Modal transparent visible={anchor !== null} animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close semester menu" />
        {anchor ? (
          <View style={[styles.menu, anchor]}>
            {terms.map((term) => {
              const active = term.key === selected.key;
              return (
                <Pressable
                  key={term.key}
                  onPress={() => {
                    close();
                    onSelect(term);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.option,
                    active && styles.optionActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {term.label}
                  </Text>
                  {active ? <Ionicons name="checkmark" size={16} color={colors.accentOnSoft} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.pill,
  },
  pillText: {
    color: colors.inkStrong,
    fontSize: 14,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  menu: {
    position: 'absolute',
    minWidth: 180,
    padding: space[1],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.panel,
    ...shadows.raised,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    borderRadius: radii.control,
  },
  optionActive: {
    backgroundColor: colors.accentSoft,
  },
  optionText: {
    color: colors.ink,
    fontSize: 15,
  },
  optionTextActive: {
    color: colors.accentOnSoft,
    fontWeight: '600',
  },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Term } from '@/lib/terms';
import { colors, radii, shadows, space } from '@/theme';

type Props = {
  terms: Term[];
  selected: Term;
  onSelect: (term: Term) => void;
};

// The semester pill at the top of the history screen. Tapping it opens a
// small menu of this academic year's semesters.
export function SemesterPicker({ terms, selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Semester: ${selected.label}. Change semester`}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
      >
        <Text style={styles.pillText}>{selected.label}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.inkMuted} />
      </Pressable>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityLabel="Close semester menu"
        >
          <View style={styles.scrim} />
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>Semester</Text>
            {terms.map((term) => {
              const active = term.key === selected.key;
              return (
                <Pressable
                  key={term.key}
                  onPress={() => {
                    setOpen(false);
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
                </Pressable>
              );
            })}
          </View>
        </Pressable>
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[5],
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.ink,
    opacity: 0.3,
  },
  menu: {
    alignSelf: 'stretch',
    gap: space[1],
    padding: space[3],
    backgroundColor: colors.surface,
    borderRadius: radii.panel,
    ...shadows.raised,
  },
  menuTitle: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: space[2],
    paddingBottom: space[1],
  },
  option: {
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    borderRadius: radii.control,
  },
  optionActive: {
    backgroundColor: colors.accentSoft,
  },
  optionText: {
    color: colors.ink,
    fontSize: 16,
  },
  optionTextActive: {
    color: colors.accentOnSoft,
    fontWeight: '600',
  },
});

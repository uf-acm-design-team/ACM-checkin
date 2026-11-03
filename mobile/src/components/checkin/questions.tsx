import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/form';
import {
  DEFAULT_SCALE,
  scalePoints,
  type AnswerMap,
  type AnswerValue,
  type FormQuestion,
  type FormSchema,
} from '@/lib/check-in-form';
import { colors, radii, space } from '@/theme';

/**
 * The meeting's questions, one control per type, matching web's FormRenderer.
 * Options are whole tappable rows rather than small dots: this is used
 * standing in a doorway. Dropdowns render as the same single-choice rows,
 * since a phone has no inline <select>.
 *
 * `errors` comes from validateAnswers, or from the server's invalid_answers
 * reply, keyed by question id.
 */
export function Questions({
  schema,
  answers,
  errors,
  disabled,
  onChange,
}: {
  schema: FormSchema;
  answers: AnswerMap;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (questionId: string, value: AnswerValue) => void;
}) {
  if (schema.length === 0) return null;
  return (
    <View style={styles.list}>
      {schema.map((question) => (
        <Question
          key={question.id}
          question={question}
          value={answers[question.id]}
          error={errors[question.id]}
          disabled={disabled}
          onChange={(value) => onChange(question.id, value)}
        />
      ))}
    </View>
  );
}

function Label({ question }: { question: FormQuestion }) {
  return (
    <>
      {question.label}
      {question.required ? <Text style={styles.required}> *</Text> : null}
    </>
  );
}

function Question({
  question,
  value,
  error,
  disabled,
  onChange,
}: {
  question: FormQuestion;
  value: AnswerValue | undefined;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: AnswerValue) => void;
}) {
  const text = typeof value === 'string' ? value : '';
  const options = question.options ?? [];
  let control;

  switch (question.type) {
    case 'short_text':
    case 'long_text':
      control = (
        <TextField
          label={<Label question={question} />}
          accessibilityLabel={question.label}
          value={text}
          onChangeText={onChange}
          editable={!disabled}
          invalid={Boolean(error)}
          multiline={question.type === 'long_text'}
          placeholder={question.type === 'short_text' ? 'Short answer' : 'Your answer'}
        />
      );
      break;

    case 'multiple_choice':
    case 'dropdown':
      control = options.map((option) => (
        <Option
          key={option}
          role="radio"
          label={option}
          checked={value === option}
          disabled={disabled}
          onPress={() => onChange(option)}
        />
      ));
      break;

    case 'checkboxes': {
      const selected = Array.isArray(value) ? value : [];
      control = options.map((option) => {
        const checked = selected.includes(option);
        return (
          <Option
            key={option}
            role="checkbox"
            label={option}
            checked={checked}
            disabled={disabled}
            onPress={() => onChange(checked ? selected.filter((s) => s !== option) : [...selected, option])}
          />
        );
      });
      break;
    }

    case 'scale': {
      const scale = question.scale ?? DEFAULT_SCALE;
      control = (
        <View style={styles.scaleGroup}>
          <View style={styles.scaleRow}>
            {scalePoints(scale).map((point) => (
              <Pressable
                key={point}
                accessibilityRole="button"
                accessibilityLabel={`${question.label}: ${point}`}
                accessibilityState={{ selected: value === point, disabled }}
                disabled={disabled}
                onPress={() => onChange(point)}
                style={[styles.scalePoint, value === point && styles.scalePointOn]}>
                <Text style={[styles.scaleText, value === point && styles.scaleTextOn]}>{point}</Text>
              </Pressable>
            ))}
          </View>
          {scale.min_label || scale.max_label ? (
            <View style={styles.scaleLabels}>
              <Text style={styles.hint}>{scale.min_label ?? ''}</Text>
              <Text style={styles.hint}>{scale.max_label ?? ''}</Text>
            </View>
          ) : null}
        </View>
      );
      break;
    }
  }

  const isText = question.type === 'short_text' || question.type === 'long_text';
  return (
    <View style={styles.question}>
      {/* TextField draws its own label; the other controls need one here. */}
      {isText ? null : (
        <Text style={styles.label}>
          <Label question={question} />
        </Text>
      )}
      {control}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** One choice as a full-width row; the selected state is the row's border and tint. */
function Option({
  role,
  label,
  checked,
  disabled,
  onPress,
}: {
  role: 'radio' | 'checkbox';
  label: string;
  checked: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.option, checked && styles.optionOn]}>
      <View style={[styles.mark, role === 'radio' && styles.markRadio, checked && styles.markOn]} />
      <Text style={styles.optionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[5] },
  question: { gap: space[2] },
  label: {
    color: colors.inkStrong,
    fontSize: 13,
    fontWeight: '600',
  },
  required: { color: colors.bad },
  error: {
    color: colors.badInk,
    fontSize: 12,
  },
  hint: {
    color: colors.inkFaint,
    fontSize: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 44,
    paddingHorizontal: space[3],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.control,
  },
  optionOn: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  mark: {
    width: 16,
    height: 16,
    borderColor: colors.line,
    borderWidth: 1.5,
    borderRadius: 3,
  },
  markRadio: { borderRadius: radii.pill },
  markOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  optionText: {
    flex: 1,
    paddingVertical: space[2],
    color: colors.ink,
    fontSize: 15,
  },
  scaleGroup: { gap: space[1] + 2 },
  scaleRow: {
    flexDirection: 'row',
    gap: space[1] + 2,
  },
  scalePoint: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.control,
  },
  scalePointOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  scaleText: {
    color: colors.inkMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  scaleTextOn: { color: colors.accentInk },
  scaleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

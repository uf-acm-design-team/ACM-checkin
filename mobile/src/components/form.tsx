import { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, shadows, space } from '@/theme';

/** A centred card for forms (sign in, sign up, onboarding) that stays above the keyboard. */
export function FormScreen({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {children}
          </View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Labelled text input with the web's focus treatment (accent border). */
export function TextField({ label, ...inputProps }: { label: string } & TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.inkFaint}
        {...inputProps}
        onFocus={(e) => {
          setFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          inputProps.onBlur?.(e);
        }}
        style={[styles.input, focused && styles.inputFocused]}
      />
    </View>
  );
}

/** Email input with the right keyboard, autofill and no auto-capitalisation. */
export function EmailField(inputProps: TextInputProps) {
  return (
    <TextField
      label="Email"
      placeholder="you@ufl.edu"
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="email"
      keyboardType="email-address"
      textContentType="emailAddress"
      {...inputProps}
    />
  );
}

/**
 * Password input with a Show/Hide toggle. `isNew` tells password managers
 * whether to fill a saved password (sign in) or suggest a new one (sign up).
 */
export function PasswordField({
  label = 'Password',
  isNew = false,
  ...inputProps
}: { label?: string; isNew?: boolean } & TextInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <TextField
        label={label}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={isNew ? 'new-password' : 'current-password'}
        textContentType={isNew ? 'newPassword' : 'password'}
        {...inputProps}
      />
      <Text
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        onPress={() => setVisible((v) => !v)}
        style={styles.toggle}>
        {visible ? 'Hide' : 'Show'}
      </Text>
    </View>
  );
}

/** Inline error in the system's "bad" tone. Renders nothing without a message. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {message}
    </Text>
  );
}

/** "or" separator between Google and email sign-in. */
export function Divider({ label = 'or' }: { label?: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerLabel}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

/** Muted helper text, optionally with an inline action (e.g. "Sign up"). */
export function FooterText({ children }: { children: ReactNode }) {
  return <Text style={styles.footerText}>{children}</Text>;
}

export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text accessibilityRole="link" onPress={onPress} style={styles.link}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: space[4],
  },
  card: {
    gap: space[4],
    padding: space[5],
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
    ...shadows.card,
  },
  header: { gap: space[1] },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: 15,
    lineHeight: 21,
  },
  field: { gap: space[1] + 2 },
  label: {
    color: colors.inkStrong,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    minHeight: 44,
    paddingHorizontal: space[3],
    color: colors.ink,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.control,
    // 16+ keeps iOS from zooming, same reason as web's mobile input rule.
    fontSize: 16,
  },
  inputFocused: {
    borderColor: colors.accent,
  },
  toggle: {
    position: 'absolute',
    right: space[3],
    bottom: 12,
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    padding: space[3],
    color: colors.badInk,
    backgroundColor: colors.badSurface,
    borderColor: colors.badLine,
    borderWidth: 1,
    borderRadius: radii.control,
    fontSize: 14,
    lineHeight: 19,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
  dividerLabel: {
    color: colors.inkFaint,
    fontSize: 13,
  },
  footer: {
    alignItems: 'center',
    marginTop: space[5],
  },
  footerText: {
    color: colors.inkMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  link: {
    color: colors.accent,
    fontWeight: '600',
  },
});

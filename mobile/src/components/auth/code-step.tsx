import { useState, type ReactNode } from 'react';

import { Button } from '@/components/button';
import { FooterText, FormError, TextField, TextLink } from '@/components/form';

/**
 * "Enter the 6-digit code we emailed you" -- used after sign-up (to verify
 * the email) and in forgot-password. `children` renders extra fields under
 * the code (e.g. the new password when resetting).
 */
export function CodeStep({
  email,
  submitLabel = 'Verify',
  canSubmit = true,
  loading,
  error,
  onSubmit,
  onResend,
  onBack,
  children,
}: {
  email: string;
  submitLabel?: string;
  /** Extra condition for enabling submit, beyond a 6-digit code. */
  canSubmit?: boolean;
  loading: boolean;
  error: string | null;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onBack: () => void;
  children?: ReactNode;
}) {
  const [code, setCode] = useState('');
  const ready = code.length === 6 && canSubmit;

  return (
    <>
      <FooterText>
        We emailed a 6-digit code to {email}. It expires in 10 minutes. Check your junk folder if
        you don’t see it.
      </FooterText>
      <TextField
        label="Verification code"
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
        placeholder="123456"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        autoFocus
      />
      {children}
      <FormError message={error} />
      <Button label={submitLabel} loading={loading} disabled={!ready} onPress={() => onSubmit(code)} />
      <FooterText>
        <TextLink label="Resend code" onPress={onResend} />
        {'   ·   '}
        <TextLink label="Use a different email" onPress={onBack} />
      </FooterText>
    </>
  );
}

import { useSignIn } from '@clerk/expo';
import { router } from 'expo-router';
import { useState } from 'react';

import { CodeStep } from '@/components/auth/code-step';
import { finishSignIn } from '@/components/auth/finish';
import { useFormAction } from '@/components/auth/use-form-action';
import { Button } from '@/components/button';
import { EmailField, FooterText, FormError, FormScreen, PasswordField, TextLink } from '@/components/form';
import { clerkErrorMessage } from '@/lib/clerk-errors';

/**
 * Reset a forgotten password: email → 6-digit code → new password. Also how
 * a Google-only account sets a password. Signs the user in when done.
 */
export default function ForgotPasswordScreen() {
  const { signIn } = useSignIn();
  const { loading, error, setError, run } = useFormAction();
  const [codeSent, setCodeSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const sendCode = () =>
    run(async () => {
      const created = await signIn.create({ identifier: email.trim() });
      if (created.error) return clerkErrorMessage(created.error);
      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) return clerkErrorMessage(sent.error);
      setCodeSent(true);
      return null;
    });

  const resetPassword = (code: string) =>
    run(async () => {
      // If the code was already accepted and only the password was rejected
      // (e.g. too short), don't verify the same code twice.
      if (signIn.status !== 'needs_new_password') {
        const verified = await signIn.resetPasswordEmailCode.verifyCode({ code });
        if (verified.error) return clerkErrorMessage(verified.error);
      }
      const submitted = await signIn.resetPasswordEmailCode.submitPassword({ password });
      // Signed in with the new password; the root navigator takes over.
      return submitted.error ? clerkErrorMessage(submitted.error) : finishSignIn(signIn);
    });

  return (
    <FormScreen
      title="Reset your password"
      subtitle={
        codeSent
          ? 'Enter the code and choose a new password.'
          : "Enter your account's email and we'll send you a code."
      }
      footer={
        <FooterText>
          Remembered it? <TextLink label="Back to sign in" onPress={() => router.replace('/sign-in')} />
        </FooterText>
      }>
      {codeSent ? (
        <CodeStep
          email={email.trim()}
          submitLabel="Reset password"
          canSubmit={password.length > 0}
          loading={loading}
          error={error}
          onSubmit={resetPassword}
          onResend={sendCode}
          onBack={() => {
            setError(null);
            setCodeSent(false);
            void signIn.reset();
          }}>
          <PasswordField label="New password" isNew value={password} onChangeText={setPassword} />
        </CodeStep>
      ) : (
        <>
          <EmailField value={email} onChangeText={setEmail} returnKeyType="send" onSubmitEditing={sendCode} />
          <FormError message={error} />
          <Button label="Email me a code" loading={loading} disabled={!email.trim()} onPress={sendCode} />
        </>
      )}
    </FormScreen>
  );
}

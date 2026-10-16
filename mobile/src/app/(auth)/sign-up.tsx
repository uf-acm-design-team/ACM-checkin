import { useSignUp } from '@clerk/expo';
import { router } from 'expo-router';
import { useState } from 'react';

import { CodeStep } from '@/components/auth/code-step';
import { finishSignUp } from '@/components/auth/finish';
import { GoogleButton } from '@/components/auth/google-button';
import { useFormAction } from '@/components/auth/use-form-action';
import { Button } from '@/components/button';
import { Divider, EmailField, FooterText, FormError, FormScreen, PasswordField, TextLink } from '@/components/form';
import { clerkErrorMessage } from '@/lib/clerk-errors';

/**
 * Create account: email + password (password is required in Clerk, same as
 * web), then a 6-digit code to verify the email. Or Continue with Google.
 * Password rules (minimum length, breached-password check) come from the
 * Clerk dashboard; Clerk's error message names the rule that failed.
 */
export default function SignUpScreen() {
  const { signUp } = useSignUp();
  const { loading, error, setError, run } = useFormAction();
  const [codeSent, setCodeSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const sendCode = async () => {
    const sent = await signUp.verifications.sendEmailCode();
    return sent.error ? clerkErrorMessage(sent.error) : null;
  };

  const createAccount = () =>
    run(async () => {
      const created = await signUp.password({ emailAddress: email.trim(), password });
      if (created.error) return clerkErrorMessage(created.error);
      const sendError = await sendCode();
      if (!sendError) setCodeSent(true);
      return sendError;
    });

  const verify = (code: string) =>
    run(async () => {
      const verified = await signUp.verifications.verifyEmailCode({ code });
      // Activating the session flips the root navigator to onboarding.
      return verified.error ? clerkErrorMessage(verified.error) : finishSignUp(signUp);
    });

  return (
    <FormScreen
      title="Create an account"
      subtitle="Check in to your clubs' meetings and track your attendance."
      footer={
        <FooterText>
          Already have an account? <TextLink label="Sign in" onPress={() => router.replace('/sign-in')} />
        </FooterText>
      }>
      {codeSent ? (
        <CodeStep
          email={email.trim()}
          loading={loading}
          error={error}
          onSubmit={verify}
          onResend={() => run(sendCode)}
          onBack={() => {
            setError(null);
            setCodeSent(false);
            void signUp.reset();
          }}
        />
      ) : (
        <>
          <GoogleButton onError={setError} />
          <Divider />
          <EmailField value={email} onChangeText={setEmail} />
          <PasswordField
            isNew
            value={password}
            onChangeText={setPassword}
            returnKeyType="go"
            onSubmitEditing={createAccount}
          />
          <FormError message={error} />
          <Button
            label="Create account"
            loading={loading}
            disabled={!email.trim() || !password}
            onPress={createAccount}
          />
        </>
      )}
    </FormScreen>
  );
}

import { useSignIn } from '@clerk/expo';
import { router } from 'expo-router';
import { useState } from 'react';

import { CodeStep } from '@/components/auth/code-step';
import { finishSignIn } from '@/components/auth/finish';
import { GoogleButton } from '@/components/auth/google-button';
import { useFormAction } from '@/components/auth/use-form-action';
import { Button } from '@/components/button';
import { Divider, EmailField, FooterText, FormError, FormScreen, PasswordField, TextLink } from '@/components/form';
import { clerkErrorMessage } from '@/lib/clerk-errors';

/**
 * Sign in with email + password (like web), Continue with Google, or an
 * emailed code. The code option stays because accounts created with Google
 * have no password, and Clerk still allows email codes for sign-in.
 */
export default function SignInScreen() {
  const { signIn } = useSignIn();
  const { loading, error, setError, run } = useFormAction();
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [codeSent, setCodeSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const signInWithPassword = () =>
    run(async () => {
      const result = await signIn.password({ emailAddress: email.trim(), password });
      return result.error ? clerkErrorMessage(result.error) : finishSignIn(signIn);
    });

  const sendCode = () =>
    run(async () => {
      const created = await signIn.create({ identifier: email.trim() });
      if (created.error) return clerkErrorMessage(created.error);
      const sent = await signIn.emailCode.sendCode();
      if (sent.error) return clerkErrorMessage(sent.error);
      setCodeSent(true);
      return null;
    });

  const verifyCode = (code: string) =>
    run(async () => {
      const verified = await signIn.emailCode.verifyCode({ code });
      return verified.error ? clerkErrorMessage(verified.error) : finishSignIn(signIn);
    });

  function switchMode(next: 'password' | 'code') {
    setError(null);
    setCodeSent(false);
    setMode(next);
    void signIn.reset();
  }

  return (
    <FormScreen
      title="Sign in"
      subtitle="Welcome back. Use the same account as the website."
      footer={
        <FooterText>
          New here? <TextLink label="Create an account" onPress={() => router.replace('/sign-up')} />
        </FooterText>
      }>
      <GoogleButton onError={setError} />
      <Divider />

      {mode === 'password' && (
        <>
          <EmailField value={email} onChangeText={setEmail} />
          <PasswordField
            value={password}
            onChangeText={setPassword}
            returnKeyType="go"
            onSubmitEditing={signInWithPassword}
          />
          <FormError message={error} />
          <Button
            label="Sign in"
            loading={loading}
            disabled={!email.trim() || !password}
            onPress={signInWithPassword}
          />
          <FooterText>
            <TextLink label="Forgot password?" onPress={() => router.push('/forgot-password')} />
            {'   ·   '}
            <TextLink label="Email me a code instead" onPress={() => switchMode('code')} />
          </FooterText>
        </>
      )}

      {mode === 'code' && !codeSent && (
        <>
          <EmailField value={email} onChangeText={setEmail} returnKeyType="send" onSubmitEditing={sendCode} />
          <FormError message={error} />
          <Button label="Email me a code" loading={loading} disabled={!email.trim()} onPress={sendCode} />
          <FooterText>
            <TextLink label="Use my password instead" onPress={() => switchMode('password')} />
          </FooterText>
        </>
      )}

      {mode === 'code' && codeSent && (
        <CodeStep
          email={email.trim()}
          loading={loading}
          error={error}
          onSubmit={verifyCode}
          onResend={sendCode}
          onBack={() => switchMode('code')}
        />
      )}
    </FormScreen>
  );
}

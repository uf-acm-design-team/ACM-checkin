import type { useSignIn, useSignUp } from '@clerk/expo';

import { clerkErrorMessage } from '@/lib/clerk-errors';

type SignIn = ReturnType<typeof useSignIn>['signIn'];
type SignUp = ReturnType<typeof useSignUp>['signUp'];

/**
 * Activates the session once a sign-in's checks have passed. The root
 * navigator then moves the user to onboarding or the tabs. Returns an error
 * message, or null on success.
 */
export async function finishSignIn(signIn: SignIn): Promise<string | null> {
  if (signIn.status !== 'complete') {
    // Second factors / device trust aren't enabled for this app's Clerk instance.
    return `Sign-in needs another step this app doesn't support yet (${signIn.status}).`;
  }
  const finalized = await signIn.finalize();
  return finalized.error ? clerkErrorMessage(finalized.error) : null;
}

/** Same as finishSignIn, for a sign-up whose email was just verified. */
export async function finishSignUp(signUp: SignUp): Promise<string | null> {
  if (signUp.status !== 'complete') return missingFieldsMessage(signUp.missingFields, signUp.status);
  const finalized = await signUp.finalize();
  return finalized.error ? clerkErrorMessage(finalized.error) : null;
}

/** Clerk wants more before it will create the account (a dashboard setting, not user error). */
export function missingFieldsMessage(missingFields: readonly string[], status?: string | null): string {
  const missing = missingFields.join(', ') || status || 'more information';
  return `Clerk still needs: ${missing}. Check the Clerk app's sign-up settings.`;
}

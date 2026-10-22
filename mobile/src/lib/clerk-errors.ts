/** Clerk error codes we turn into friendlier copy. Everything else uses Clerk's own message. */
const FRIENDLY: Record<string, string> = {
  form_identifier_not_found: 'No account uses that email yet. Create one instead.',
  form_identifier_exists: 'An account with that email already exists. Sign in instead.',
  form_code_incorrect: "That code isn't right. Check the email and try again.",
  verification_expired: 'That code has expired. Request a new one.',
  form_param_format_invalid: "That doesn't look like a valid email address.",
  form_password_incorrect: "That password isn't right. Try again, or use “Forgot password?”.",
  form_password_pwned:
    'That password has shown up in a data breach, so it isn’t safe to use. Please choose a different one.',
  // An account created with Google (or before passwords were required) has no password.
  strategy_for_user_invalid:
    'This account doesn’t have a password yet. Use “Continue with Google”, “Email me a code instead”, or “Forgot password?” to set one.',
  // Length / strength errors keep Clerk's own message: it names the exact rule (e.g. the minimum length).
};

type ClerkLikeError = {
  code?: string;
  message?: string;
  longMessage?: string;
  errors?: { code?: string; message?: string; longMessage?: string }[];
};

/** The first Clerk error code, from either the Core 3 ClerkError or a classic API response error. */
export function clerkErrorCode(err: unknown): string | undefined {
  const e = err as ClerkLikeError | null | undefined;
  return e?.errors?.[0]?.code ?? e?.code;
}

/** A sentence a user can act on, for any error Clerk throws or returns. */
export function clerkErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as ClerkLikeError | null | undefined;
  const code = clerkErrorCode(err);
  if (code && FRIENDLY[code]) return FRIENDLY[code];
  return e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? e?.longMessage ?? e?.message ?? fallback;
}

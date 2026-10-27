import { clerkErrorCode, clerkErrorMessage } from './clerk-errors';

describe('clerkErrorMessage', () => {
  it('uses friendly copy for known codes (Core 3 ClerkError shape)', () => {
    expect(clerkErrorMessage({ code: 'form_password_incorrect', message: 'Password is incorrect.' })).toContain(
      'Forgot password?',
    );
  });

  it('reads the code from a classic API response error', () => {
    const err = { errors: [{ code: 'strategy_for_user_invalid', message: 'Invalid strategy' }] };
    expect(clerkErrorCode(err)).toBe('strategy_for_user_invalid');
    expect(clerkErrorMessage(err)).toContain('doesn’t have a password');
  });

  it("keeps Clerk's own message for rules it states precisely (e.g. minimum length)", () => {
    const err = {
      errors: [
        {
          code: 'form_password_length_too_short',
          message: 'too short',
          longMessage: 'Passwords must be 15 characters or more.',
        },
      ],
    };
    expect(clerkErrorMessage(err)).toBe('Passwords must be 15 characters or more.');
  });

  it('falls back when there is nothing usable', () => {
    expect(clerkErrorMessage(undefined, 'Fallback.')).toBe('Fallback.');
  });
});

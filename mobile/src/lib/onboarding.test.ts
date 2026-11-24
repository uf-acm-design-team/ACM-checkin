import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { MAX_NAME_LENGTH, submitOnboardingProfile, validateOnboarding } from './onboarding';
import type { MobileSupabase } from './supabase/client';

const valid = { firstName: 'Maya', lastName: 'Rivera', gradYear: '2027' };

describe('validateOnboarding (same rules as web)', () => {
  it('accepts a valid profile, ignoring surrounding spaces', () => {
    expect(validateOnboarding({ firstName: ' Maya ', lastName: 'Rivera ', gradYear: ' 2027' })).toBeNull();
  });

  it.each([
    ['empty first name', { ...valid, firstName: '   ' }, 'First name'],
    ['too-long first name', { ...valid, firstName: 'a'.repeat(MAX_NAME_LENGTH + 1) }, 'First name'],
    ['empty last name', { ...valid, lastName: '' }, 'Last name'],
    ['non-numeric grad year', { ...valid, gradYear: '20x7' }, 'Grad year'],
    ['empty grad year', { ...valid, gradYear: '' }, 'Grad year'],
  ])('rejects %s', (_label, input, field) => {
    expect(validateOnboarding(input)).toContain(field);
  });

  it(`allows a name of exactly ${MAX_NAME_LENGTH} characters`, () => {
    expect(validateOnboarding({ ...valid, firstName: 'a'.repeat(MAX_NAME_LENGTH) })).toBeNull();
  });
});

describe('submitOnboardingProfile (onboard-attendee edge function)', () => {
  type InvokeResult = { data: unknown; error: unknown; response?: Response };

  function fakeSupabase(result: InvokeResult) {
    const invoke = jest.fn(async () => result);
    const supabase = { client: { functions: { invoke } } } as unknown as MobileSupabase;
    return { supabase, invoke };
  }

  function httpError(status: number, body: unknown) {
    return new FunctionsHttpError(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json' },
      }),
    );
  }

  const saved = {
    ok: true,
    success: true,
    claimed: false,
    attendee: { id: 'a1', email: 'maya@ufl.edu', first_name: 'Maya', last_name: 'Rivera', grad_year: '2027' },
  };

  it('rejects invalid input without calling the server', async () => {
    const { supabase, invoke } = fakeSupabase({ data: saved, error: null });
    await expect(submitOnboardingProfile({ ...valid, gradYear: 'soon' }, supabase)).resolves.toEqual({
      ok: false,
      error: 'Grad year must be a number.',
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('sends the trimmed profile to onboard-attendee', async () => {
    const { supabase, invoke } = fakeSupabase({ data: saved, error: null });
    await expect(
      submitOnboardingProfile({ firstName: ' Maya ', lastName: 'Rivera', gradYear: '2027 ' }, supabase),
    ).resolves.toEqual({ ok: true });

    expect(invoke).toHaveBeenCalledWith('onboard-attendee', {
      body: { firstName: 'Maya', lastName: 'Rivera', gradYear: '2027' },
    });
  });

  it('succeeds when the user was already onboarded', async () => {
    const { supabase } = fakeSupabase({ data: { ...saved, alreadyOnboarded: true }, error: null });
    await expect(submitOnboardingProfile(valid, supabase)).resolves.toEqual({ ok: true });
  });

  // Regression: a 404 used to let the user through without saving anything,
  // back when onboard-attendee wasn't merged yet.
  it('fails when the function is not being served (gateway 404)', async () => {
    const { supabase } = fakeSupabase({ data: null, error: httpError(404, 'Function not found') });
    await expect(submitOnboardingProfile(valid, supabase)).resolves.toEqual({
      ok: false,
      error: "Onboarding isn't available right now (error 404). Please try again later.",
    });
  });

  // Reply bodies exactly as supabase/functions/onboard-attendee/index.ts sends them.
  it.each([
    [401, 'You must be signed in to complete onboarding.', 'Your session has expired. Please sign in again.'],
    [
      400,
      'No email address found for this Clerk account.',
      "We couldn't save these details. Make sure every field is filled in and your account has an email address.",
    ],
    [
      409,
      "This email is already linked to another account. Contact an officer if that's unexpected.",
      "This email is already linked to another account. Contact an officer if that's unexpected.",
    ],
    [
      500,
      'Failed to save profile: duplicate key value violates unique constraint',
      'Something went wrong on our end while saving your profile. Please try again in a moment.',
    ],
    [405, 'Method not allowed.', "Couldn't save your profile (error 405). Please try again."],
  ])('explains a %i reply', async (status, serverError, message) => {
    const { supabase } = fakeSupabase({ data: null, error: httpError(status, { ok: false, error: serverError }) });
    await expect(submitOnboardingProfile(valid, supabase)).resolves.toEqual({ ok: false, error: message });
  });

  it('explains a network failure', async () => {
    const { supabase } = fakeSupabase({
      data: null,
      error: new FunctionsFetchError(new TypeError('Network request failed')),
    });
    await expect(submitOnboardingProfile(valid, supabase)).resolves.toEqual({
      ok: false,
      error: "Couldn't reach the server. Check your connection and try again.",
    });
  });

  it('asks the user to sign in again without a signed-in client', async () => {
    await expect(submitOnboardingProfile(valid, null)).resolves.toEqual({
      ok: false,
      error: 'Your session has expired. Please sign in again.',
    });
  });
});

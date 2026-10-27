import { MAX_NAME_LENGTH, submitOnboardingProfile, validateOnboarding } from './onboarding';

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
  const getToken = async () => 'clerk-jwt';

  function deps(response: { status: number; json?: unknown } | Error) {
    const fetchImpl = jest.fn(async () => {
      if (response instanceof Error) throw response;
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        json: async () => response.json,
      } as Response;
    });
    return { fetchImpl, supabaseUrl: 'http://127.0.0.1:54321', supabaseAnonKey: 'anon-key' };
  }

  it('rejects invalid input without calling the server', async () => {
    const d = deps({ status: 200, json: { ok: true } });
    await expect(submitOnboardingProfile({ ...valid, gradYear: 'soon' }, getToken, d)).resolves.toEqual({
      ok: false,
      error: 'Grad year must be a number.',
    });
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it('POSTs the trimmed profile with the Clerk token', async () => {
    const d = deps({ status: 200, json: { ok: true } });
    await submitOnboardingProfile({ firstName: ' Maya ', lastName: 'Rivera', gradYear: '2027 ' }, getToken, d);

    expect(d.fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:54321/functions/v1/onboard-attendee', {
      method: 'POST',
      headers: {
        apikey: 'anon-key',
        Authorization: 'Bearer clerk-jwt',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ firstName: 'Maya', lastName: 'Rivera', gradYear: '2027' }),
    });
  });

  it('reports saved when the function succeeds', async () => {
    const d = deps({ status: 200, json: { ok: true, claimed: false } });
    await expect(submitOnboardingProfile(valid, getToken, d)).resolves.toEqual({ ok: true, saved: true });
  });

  it('falls back to the stub (not saved) when the function is not deployed', async () => {
    const d = deps({ status: 404, json: { msg: 'Function not found' } });
    await expect(submitOnboardingProfile(valid, getToken, d)).resolves.toEqual({ ok: true, saved: false });
  });

  it("shows the function's own error message", async () => {
    const d = deps({
      status: 409,
      json: { ok: false, error: 'This email is already linked to another account.' },
    });
    await expect(submitOnboardingProfile(valid, getToken, d)).resolves.toEqual({
      ok: false,
      error: 'This email is already linked to another account.',
    });
  });

  it('explains a network failure', async () => {
    const d = deps(new Error('Network request failed'));
    await expect(submitOnboardingProfile(valid, getToken, d)).resolves.toEqual({
      ok: false,
      error: "Couldn't reach the server. Check your connection and try again.",
    });
  });

  it('asks the user to sign in again without a token', async () => {
    const d = deps({ status: 200, json: { ok: true } });
    await expect(submitOnboardingProfile(valid, async () => null, d)).resolves.toEqual({
      ok: false,
      error: 'Your session has expired. Please sign in again.',
    });
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });
});

import { checkAttendeeProfile } from './attendee-profile';

function fakeFetch(response: { ok: boolean; status?: number; json?: unknown } | Error) {
  return jest.fn(async () => {
    if (response instanceof Error) throw response;
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.json,
    } as Response;
  });
}

const base = {
  userId: 'user_123',
  token: 'clerk-jwt',
  supabaseUrl: 'http://127.0.0.1:54321/',
  supabaseAnonKey: 'anon-key',
};

describe('checkAttendeeProfile', () => {
  it('is complete when an attendees row exists', async () => {
    const fetchImpl = fakeFetch({ ok: true, json: [{ id: 'a1' }] });
    await expect(checkAttendeeProfile({ ...base, fetchImpl })).resolves.toBe('complete');
  });

  it('is missing when there is no attendees row', async () => {
    const fetchImpl = fakeFetch({ ok: true, json: [] });
    await expect(checkAttendeeProfile({ ...base, fetchImpl })).resolves.toBe('missing');
  });

  it('queries attendees by Clerk user id with the anon key and Clerk token', async () => {
    const fetchImpl = fakeFetch({ ok: true, json: [] });
    await checkAttendeeProfile({ ...base, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:54321/rest/v1/attendees?select=id&user_id=eq.user_123&limit=1',
      expect.objectContaining({
        headers: { apikey: 'anon-key', Authorization: 'Bearer clerk-jwt' },
      }),
    );
  });

  describe('fails open (treats the user as onboarded)', () => {
    it('on an HTTP error', async () => {
      const onError = jest.fn();
      const fetchImpl = fakeFetch({ ok: false, status: 401 });
      await expect(checkAttendeeProfile({ ...base, fetchImpl, onError })).resolves.toBe('complete');
      expect(onError).toHaveBeenCalledWith('attendee lookup failed: HTTP 401');
    });

    it('when the request throws (e.g. no network)', async () => {
      const fetchImpl = fakeFetch(new Error('Network request failed'));
      await expect(checkAttendeeProfile({ ...base, fetchImpl })).resolves.toBe('complete');
    });

    it('when the database never answers (times out)', async () => {
      const onError = jest.fn();
      // A request that only ends when it is aborted -- like an unreachable host.
      const fetchImpl = jest.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
          }),
      );
      await expect(
        checkAttendeeProfile({ ...base, fetchImpl, timeoutMs: 20, onError }),
      ).resolves.toBe('complete');
      expect(onError).toHaveBeenCalledWith('attendee lookup timed out after 20ms');
    });

    it('when Supabase is not configured', async () => {
      const fetchImpl = fakeFetch({ ok: true, json: [] });
      await expect(
        checkAttendeeProfile({ ...base, supabaseUrl: undefined, fetchImpl }),
      ).resolves.toBe('complete');
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });
});

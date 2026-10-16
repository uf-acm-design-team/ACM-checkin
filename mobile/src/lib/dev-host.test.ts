import { resolveDevSupabaseUrl } from './dev-host';

const local = 'http://127.0.0.1:54321';

describe('resolveDevSupabaseUrl', () => {
  it("swaps localhost for the laptop's address the app was loaded from", () => {
    expect(resolveDevSupabaseUrl(local, '10.136.250.134:8081', true)).toBe('http://10.136.250.134:54321');
  });

  it('also handles "localhost" and a hostUri with a path', () => {
    expect(resolveDevSupabaseUrl('http://localhost:54321', '192.168.1.20:8081/--/', true)).toBe(
      'http://192.168.1.20:54321',
    );
  });

  it('leaves the URL alone in tunnel mode (the tunnel only forwards the app, not Supabase)', () => {
    expect(resolveDevSupabaseUrl(local, 'zsxmbhq-hiteshk10-8081.exp.direct', true)).toBe(local);
  });

  it('never touches a real remote Supabase URL', () => {
    const remote = 'https://abcd.supabase.co';
    expect(resolveDevSupabaseUrl(remote, '10.0.0.5:8081', true)).toBe(remote);
  });

  it('keeps an explicit LAN IP someone set on purpose', () => {
    const explicit = 'http://192.168.1.50:54321';
    expect(resolveDevSupabaseUrl(explicit, '10.0.0.5:8081', true)).toBe(explicit);
  });

  it('does nothing outside development', () => {
    expect(resolveDevSupabaseUrl(local, '10.0.0.5:8081', false)).toBe(local);
  });

  it('does nothing when the app was loaded from localhost (e.g. iOS simulator)', () => {
    expect(resolveDevSupabaseUrl(local, '127.0.0.1:8081', true)).toBe(local);
  });

  it('passes through a missing URL', () => {
    expect(resolveDevSupabaseUrl(undefined, '10.0.0.5:8081', true)).toBeUndefined();
  });
});

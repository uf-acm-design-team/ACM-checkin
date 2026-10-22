/**
 * The onboarding gate's database check -- the mobile twin of web's proxy.ts.
 *
 * "Has this user onboarded?" means "does an attendees row exist for their
 * Clerk user id", asked of the database with the user's Clerk token so RLS
 * applies. It deliberately does NOT read a Clerk session claim: web tried
 * publicMetadata.onboardingComplete and it was always undefined, trapping
 * every user on /onboarding (see the comment in proxy.ts).
 *
 * It FAILS OPEN: if the lookup errors, the user is treated as onboarded. A
 * transient Supabase or token problem must not lock someone into the
 * onboarding screen; the screens behind it handle a missing profile anyway.
 *
 * Uses a bare fetch on purpose -- the shared Supabase client is ADTCIA-28.
 * Swap this for it once that lands.
 */

export type ProfileStatus = 'complete' | 'missing';

/**
 * How long the check may take before failing open. The app keeps the splash
 * screen up while it runs, so an unreachable database (e.g. local Supabase
 * from a phone on campus Wi-Fi) must not hang launch.
 */
export const PROFILE_CHECK_TIMEOUT_MS = 5000;

export type ProfileCheckInput = {
  userId: string;
  token: string | null;
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Called when the lookup fails and we fail open. */
  onError?: (reason: string) => void;
};

export async function checkAttendeeProfile({
  userId,
  token,
  supabaseUrl,
  supabaseAnonKey,
  fetchImpl = fetch,
  timeoutMs = PROFILE_CHECK_TIMEOUT_MS,
  onError,
}: ProfileCheckInput): Promise<ProfileStatus> {
  if (!supabaseUrl || !supabaseAnonKey) {
    onError?.('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY not set');
    return 'complete';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(
      `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/attendees` +
        `?select=id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      {
        headers: {
          apikey: supabaseAnonKey,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      onError?.(`attendee lookup failed: HTTP ${res.status}`);
      return 'complete';
    }

    const rows = (await res.json()) as unknown;
    return Array.isArray(rows) && rows.length > 0 ? 'complete' : 'missing';
  } catch (err) {
    const reason = controller.signal.aborted
      ? `attendee lookup timed out after ${timeoutMs}ms`
      : `attendee lookup threw: ${err instanceof Error ? err.message : String(err)}`;
    onError?.(reason);
    return 'complete';
  } finally {
    clearTimeout(timer);
  }
}

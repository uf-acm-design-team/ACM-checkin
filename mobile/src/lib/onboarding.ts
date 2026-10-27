/**
 * Onboarding form rules and submission.
 *
 * Validation matches web (app/onboarding/page.tsx) so a profile that web
 * accepts, mobile accepts too.
 */

export const MAX_NAME_LENGTH = 50;

export type OnboardingInput = {
  firstName: string;
  lastName: string;
  gradYear: string;
};

/** Returns an error message for the first invalid field, or null when valid. */
export function validateOnboarding(input: OnboardingInput): string | null {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const gradYear = input.gradYear.trim();

  if (firstName.length === 0 || firstName.length > MAX_NAME_LENGTH) {
    return `First name must be between 1 and ${MAX_NAME_LENGTH} characters.`;
  }
  if (lastName.length === 0 || lastName.length > MAX_NAME_LENGTH) {
    return `Last name must be between 1 and ${MAX_NAME_LENGTH} characters.`;
  }
  if (!/^\d+$/.test(gradYear)) {
    return 'Grad year must be a number.';
  }
  return null;
}

export type SubmitResult =
  /**
   * `saved: true`  -- the attendees row now exists (created, or a guest row claimed).
   * `saved: false` -- the edge function isn't deployed on this Supabase yet, so
   *                   nothing was written (see below).
   */
  | { ok: true; saved: boolean }
  | { ok: false; error: string };

export const ONBOARD_FUNCTION = 'onboard-attendee';

type SubmitDeps = {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  fetchImpl?: typeof fetch;
};

/**
 * Creates (or claims) the user's attendees row through the onboard-attendee
 * edge function (ADTCIA-30). Mobile can't write the row itself: web does it
 * server-side with the service-role key, which must never ship in an app.
 *
 * The function identifies the user from the Clerk token -- never from the
 * body -- links any earlier guest check-ins by email, and syncs the name to
 * Clerk.
 *
 * Until that function is merged and served, Supabase answers 404. In that
 * case this returns `{ ok: true, saved: false }` so the flow can still be
 * demoed; the caller lets the user through for this app session only.
 */
export async function submitOnboardingProfile(
  input: OnboardingInput,
  getToken: () => Promise<string | null>,
  { supabaseUrl, supabaseAnonKey, fetchImpl = fetch }: SubmitDeps,
): Promise<SubmitResult> {
  const invalid = validateOnboarding(input);
  if (invalid) return { ok: false, error: invalid };

  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, error: 'The app is missing its Supabase settings (see mobile/README.md).' };
  }

  const token = await getToken().catch(() => null);
  if (!token) {
    return { ok: false, error: 'Your session has expired. Please sign in again.' };
  }

  let res: Response;
  try {
    res = await fetchImpl(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/${ONBOARD_FUNCTION}`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        gradYear: input.gradYear.trim(),
      }),
    });
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }

  if (res.status === 404) {
    // Function not deployed yet (ADTCIA-30 not merged) -- fall back to the stub.
    return { ok: true, saved: false };
  }

  const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (res.ok && body?.ok) return { ok: true, saved: true };

  return {
    ok: false,
    error: body?.error ?? `Couldn't save your profile (error ${res.status}). Please try again.`,
  };
}

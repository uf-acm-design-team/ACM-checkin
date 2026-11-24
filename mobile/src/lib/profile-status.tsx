import { useAuth } from '@clerk/expo';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { checkAttendeeProfile, type ProfileStatus } from './attendee-profile';
import { env } from './env';

type Status = ProfileStatus | 'loading' | 'signed-out';

type ProfileStatusValue = {
  status: Status;
  /** Re-run the database check (e.g. after the onboarding edge function writes the row). */
  refresh: () => void;
};

const ProfileStatusContext = createContext<ProfileStatusValue | null>(null);

/**
 * Runs the onboarding gate check once per signed-in user and shares the
 * result. Must sit inside ClerkProvider.
 */
export function ProfileStatusProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const [result, setResult] = useState<{ userId: string; status: ProfileStatus } | null>(null);
  const [checkCount, setCheckCount] = useState(0);

  // Clerk hands out a new getToken function whenever its state changes (e.g.
  // after user.reload()). Read it through a ref so that alone never re-runs
  // the check -- only sign-in, a different user, or refresh() should.
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;

    let cancelled = false;
    (async () => {
      const token = await getTokenRef.current().catch(() => null);
      const status = await checkAttendeeProfile({
        userId,
        token,
        supabaseUrl: env.supabaseUrl,
        supabaseAnonKey: env.supabaseAnonKey,
        onError: (reason) => console.warn(`Onboarding gate (failing open): ${reason}`),
      });
      if (!cancelled) setResult({ userId, status });
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId, checkCount]);

  const refresh = useCallback(() => setCheckCount((n) => n + 1), []);

  let status: Status;
  if (!isLoaded) status = 'loading';
  else if (!isSignedIn || !userId) status = 'signed-out';
  // A result for a different (previous) user doesn't count.
  else if (result?.userId !== userId) status = 'loading';
  else status = result.status;

  return (
    <ProfileStatusContext.Provider value={{ status, refresh }}>
      {children}
    </ProfileStatusContext.Provider>
  );
}

export function useProfileStatus(): ProfileStatusValue {
  const value = useContext(ProfileStatusContext);
  if (!value) throw new Error('useProfileStatus must be used inside ProfileStatusProvider');
  return value;
}

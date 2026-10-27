import { act, renderHook, waitFor } from '@testing-library/react-native';

import { checkAttendeeProfile } from './attendee-profile';
import { ProfileStatusProvider, useProfileStatus } from './profile-status';

jest.mock('./attendee-profile', () => ({ checkAttendeeProfile: jest.fn() }));
jest.mock('./env', () => ({ env: { supabaseUrl: 'http://x', supabaseAnonKey: 'anon' } }));

const mockAuth = {
  isLoaded: true,
  isSignedIn: true,
  userId: 'user_1' as string | null,
  getToken: jest.fn(async () => 'token'),
};
jest.mock('@clerk/expo', () => ({ useAuth: () => mockAuth }));

const check = checkAttendeeProfile as jest.MockedFunction<typeof checkAttendeeProfile>;

const renderStatus = () => renderHook(() => useProfileStatus(), { wrapper: ProfileStatusProvider });

beforeEach(() => {
  check.mockReset();
  mockAuth.isSignedIn = true;
  mockAuth.userId = 'user_1';
  mockAuth.getToken = jest.fn(async () => 'token');
});

it('shows onboarding when the database has no profile', async () => {
  check.mockResolvedValue('missing');
  const { result } = await renderStatus();
  await waitFor(() => expect(result.current.status).toBe('missing'));
});

// Regression: finishing onboarding in stub mode updates the Clerk name, which
// gives useAuth() a new getToken. That used to re-run the check, get 'missing'
// from the database again, and bounce the user back to onboarding.
it('stays complete after markComplete even when Clerk hands out a new getToken', async () => {
  check.mockResolvedValue('missing');
  const { result, rerender } = await renderStatus();
  await waitFor(() => expect(result.current.status).toBe('missing'));

  await act(() => result.current.markComplete());
  expect(result.current.status).toBe('complete');

  mockAuth.getToken = jest.fn(async () => 'new-token'); // what user.update() causes
  await rerender(undefined);
  await act(async () => {}); // let any (wrongly) re-triggered check settle

  expect(result.current.status).toBe('complete');
  expect(check).toHaveBeenCalledTimes(1);
});

// Regression: the stub pass used to survive sign-out, so signing back in as
// the same user skipped both the database check and onboarding.
it('forgets the stub pass on sign-out and asks the database again on sign-in', async () => {
  check.mockResolvedValue('missing');
  const { result, rerender } = await renderStatus();
  await waitFor(() => expect(result.current.status).toBe('missing'));
  await act(() => result.current.markComplete());
  expect(result.current.status).toBe('complete');

  mockAuth.isSignedIn = false; // Profile → Sign out
  mockAuth.userId = null;
  await rerender(undefined);
  expect(result.current.status).toBe('signed-out');

  mockAuth.isSignedIn = true; // sign back in as the same user
  mockAuth.userId = 'user_1';
  await rerender(undefined);
  await waitFor(() => expect(result.current.status).toBe('missing'));
  expect(check).toHaveBeenCalledTimes(2);
});

it('re-checks the database on refresh()', async () => {
  check.mockResolvedValueOnce('missing').mockResolvedValueOnce('complete');
  const { result } = await renderStatus();
  await waitFor(() => expect(result.current.status).toBe('missing'));

  await act(() => result.current.refresh());
  await waitFor(() => expect(result.current.status).toBe('complete'));
  expect(check).toHaveBeenCalledTimes(2);
});

it('is signed-out when nobody is signed in', async () => {
  mockAuth.isSignedIn = false;
  mockAuth.userId = null;
  const { result } = await renderStatus();
  expect(result.current.status).toBe('signed-out');
  expect(check).not.toHaveBeenCalled();
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import OrgCheckInScreen from '@/app/checkin/[orgSlug]';
import { colors } from '@/theme';

const mockGetOrgBySlug = jest.fn();
const mockCallMemberCheckIn = jest.fn();
const mockSupabase = { client: {} };

jest.mock('@/lib/supabase', () => {
  class CheckInNetworkError extends Error {}
  return {
    CheckInNetworkError,
    getOrgBySlug: (...args: unknown[]) => mockGetOrgBySlug(...args),
    callMemberCheckIn: (...args: unknown[]) => mockCallMemberCheckIn(...args),
    useSupabase: () => mockSupabase,
  };
});

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: () => mockBack() },
  useLocalSearchParams: () => ({ orgSlug: 'acm' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

const acm = {
  id: 'org-1',
  slug: 'acm',
  name: 'ACM',
  branding: { colors: { accent: colors.accentDeep } },
  created_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  mockGetOrgBySlug.mockReset();
  mockCallMemberCheckIn.mockReset();
  mockBack.mockReset();
});

describe('loading the scanned org', () => {
  it('shows loading, then the org once it loads', async () => {
    let finishLoading: (org: typeof acm) => void = () => {};
    mockGetOrgBySlug.mockReturnValue(new Promise((resolve) => (finishLoading = resolve)));
    await render(<OrgCheckInScreen />);
    expect(screen.getByText('Loading club…')).toBeTruthy();

    finishLoading(acm);
    await waitFor(() => expect(screen.getByText('ACM')).toBeTruthy());
    expect(mockGetOrgBySlug).toHaveBeenCalledWith(mockSupabase, 'acm');
  });

  it('says so when no org uses that slug', async () => {
    mockGetOrgBySlug.mockResolvedValue(null);
    await render(<OrgCheckInScreen />);
    await waitFor(() => expect(screen.getByText('We couldn’t find this club')).toBeTruthy());
  });

  it('shows a load error with Try again', async () => {
    mockGetOrgBySlug.mockRejectedValueOnce(new Error('getOrgBySlug: fetch failed')).mockResolvedValueOnce(acm);
    await render(<OrgCheckInScreen />);
    await waitFor(() => expect(screen.getByText('Couldn’t load this club')).toBeTruthy());
    expect(screen.getByText('getOrgBySlug: fetch failed')).toBeTruthy();

    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByText('ACM')).toBeTruthy());
  });
});

describe('calling member-check-in', () => {
  beforeEach(() => {
    mockGetOrgBySlug.mockResolvedValue(acm);
  });

  it("calls the endpoint for the org and shows the stub's reply", async () => {
    mockCallMemberCheckIn.mockResolvedValue({
      status: 501,
      ok: false,
      error: 'not implemented',
      body: { ok: false, error: 'not implemented' },
    });
    await render(<OrgCheckInScreen />);
    await waitFor(() => expect(screen.getByText('ACM')).toBeTruthy());

    await fireEvent.press(screen.getByText('Check in'));

    await waitFor(() => expect(screen.getByText('Check-in isn’t available yet')).toBeTruthy());
    expect(screen.getByText('Server replied 501: “not implemented”')).toBeTruthy();
    expect(mockCallMemberCheckIn).toHaveBeenCalledWith(mockSupabase, { orgSlug: 'acm', answers: {} });
  });

  it('asks the user to sign in again on a 401', async () => {
    mockCallMemberCheckIn.mockResolvedValue({ status: 401, ok: false, error: 'You must be signed in.', body: {} });
    await render(<OrgCheckInScreen />);
    await waitFor(() => expect(screen.getByText('ACM')).toBeTruthy());

    await fireEvent.press(screen.getByText('Check in'));
    await waitFor(() => expect(screen.getByText('Please sign in again')).toBeTruthy());
  });

  it('shows a network error when the server is unreachable', async () => {
    const { CheckInNetworkError } = jest.requireMock('@/lib/supabase');
    mockCallMemberCheckIn.mockRejectedValue(new CheckInNetworkError('Network request failed'));
    await render(<OrgCheckInScreen />);
    await waitFor(() => expect(screen.getByText('ACM')).toBeTruthy());

    await fireEvent.press(screen.getByText('Check in'));
    await waitFor(() => expect(screen.getByText('Couldn’t reach the server')).toBeTruthy());
  });

  it('goes back to the scanner', async () => {
    await render(<OrgCheckInScreen />);
    await waitFor(() => expect(screen.getByText('ACM')).toBeTruthy());
    await fireEvent.press(screen.getByText('Scan another code'));
    expect(mockBack).toHaveBeenCalled();
  });
});

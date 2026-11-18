import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import HomeScreen from '@/app/(tabs)/index';
import type { HomeOrg } from '@/lib/supabase';

const mockGetMyHomeOrgs = jest.fn<Promise<HomeOrg[]>, []>();
const mockSupabase = {};
const mockPush = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

jest.mock('@clerk/expo', () => ({ useUser: () => ({ user: { firstName: 'Jaedyn' } }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/lib/supabase', () => ({
  useSupabase: () => mockSupabase,
  getMyHomeOrgs: () => mockGetMyHomeOrgs(),
}));

const acm: HomeOrg = {
  org: { id: 'org-acm', slug: 'acm', name: 'ACM', branding: null, created_at: '2026-10-01T00:00:00Z' },
  role: 'officer',
  status: 'pending',
  attended: 2,
  nextMeeting: null,
  checkedInToday: false,
};

beforeEach(() => mockGetMyHomeOrgs.mockReset());

it('lists your orgs with check-ins and progress', async () => {
  mockGetMyHomeOrgs.mockResolvedValue([acm]);
  await render(<HomeScreen />);

  expect(await screen.findByText('ACM')).toBeTruthy();
  expect(screen.getByText('Hi, Jaedyn')).toBeTruthy();
  expect(screen.getByText('2 check-ins')).toBeTruthy();
  expect(screen.getByText('Officer')).toBeTruthy();
  expect(screen.getByText('1 more check-in to become a member')).toBeTruthy();
});

it('opens the attendance history when you tap an org', async () => {
  mockGetMyHomeOrgs.mockResolvedValue([acm]);
  await render(<HomeScreen />);

  await fireEvent.press(await screen.findByText('ACM'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/org/[orgSlug]', params: { orgSlug: 'acm' } });
});

it('shows an active member with only 1 check-in as a member', async () => {
  mockGetMyHomeOrgs.mockResolvedValue([{ ...acm, role: 'member', status: 'active', attended: 1 }]);
  await render(<HomeScreen />);

  expect(await screen.findByText("You're a member")).toBeTruthy();
  expect(screen.queryByText(/more check-ins? to become a member/)).toBeNull();
});

it('shows the empty state when you have no orgs', async () => {
  mockGetMyHomeOrgs.mockResolvedValue([]);
  await render(<HomeScreen />);

  expect(await screen.findByText("You haven't checked in anywhere yet")).toBeTruthy();
});

it('shows the error state and retries', async () => {
  mockGetMyHomeOrgs.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce([acm]);
  await render(<HomeScreen />);

  expect(await screen.findByText("Couldn't load your orgs")).toBeTruthy();
  await fireEvent.press(screen.getByText('Try again'));
  await waitFor(() => expect(screen.getByText('ACM')).toBeTruthy());
});

it('shows the next meeting with its day and time', async () => {
  mockGetMyHomeOrgs.mockResolvedValue([
    {
      ...acm,
      nextMeeting: { id: 'm1', title: 'General Body Meeting', startTime: '2026-11-25T23:00:00Z', endTime: null },
    },
  ]);
  await render(<HomeScreen />);

  expect(await screen.findByText('General Body Meeting')).toBeTruthy();
  // 23:00 UTC is 6 PM Eastern.
  expect(screen.getByText('Wed, Nov 25 · 6:00 PM')).toBeTruthy();
  expect(screen.getByText('Up next')).toBeTruthy();
  expect(screen.queryByText('Checked in today')).toBeNull();
});

it('says so when there is no upcoming meeting', async () => {
  mockGetMyHomeOrgs.mockResolvedValue([acm]);
  await render(<HomeScreen />);

  expect(await screen.findByText('No meetings scheduled')).toBeTruthy();
});

it('shows the checked-in strip and reads it out', async () => {
  mockGetMyHomeOrgs.mockResolvedValue([{ ...acm, checkedInToday: true }]);
  await render(<HomeScreen />);

  expect(await screen.findByText('Checked in today')).toBeTruthy();
  expect(screen.getByLabelText('ACM, Officer, 2 check-ins, Checked in today, No meetings scheduled')).toBeTruthy();
});

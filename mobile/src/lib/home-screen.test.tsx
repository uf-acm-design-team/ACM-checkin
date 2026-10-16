import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import HomeScreen from '@/app/(tabs)/index';
import type { HomeOrg } from '@/lib/supabase';

const mockGetMyHomeOrgs = jest.fn<Promise<HomeOrg[]>, []>();
const mockSupabase = {};

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

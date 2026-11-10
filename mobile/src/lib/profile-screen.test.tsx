import { fireEvent, render, screen } from '@testing-library/react-native';

import ProfileScreen from '@/app/(tabs)/profile';
import type { MyMembership, MyProfile } from '@/lib/supabase';
import type { Term } from '@/lib/terms';

const mockGetMyProfile = jest.fn<Promise<MyProfile>, []>();
const mockSignOut = jest.fn();
const mockSupabase = {};

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: { firstName: 'Jaedyn', fullName: 'Jaedyn Petaway' } }),
  useClerk: () => ({ signOut: mockSignOut }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/lib/supabase', () => ({
  useSupabase: () => mockSupabase,
  getMyProfile: () => mockGetMyProfile(),
}));
jest.mock('@/lib/org-display', () => ({
  ...jest.requireActual('@/lib/org-display'),
  membershipThreshold: (slug: string) => (slug === 'wece' ? null : 3),
}));
jest.mock('@/components/semester-picker', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    SemesterPicker: ({ terms, onSelect }: { terms: Term[]; onSelect: (term: Term) => void }) =>
      terms.map((term) => (
        <Pressable key={term.key} accessibilityRole="button" onPress={() => onSelect(term)}>
          <Text>{term.label}</Text>
        </Pressable>
      )),
  };
});

const membership = (slug: string, name: string): MyMembership => ({
  org_id: slug,
  role: 'member',
  status: 'pending',
  created_at: '2026-08-01T00:00:00Z',
  organization: { id: slug, slug, name, branding: null, created_at: '2026-08-01T00:00:00Z' },
});

const emptyProfile: MyProfile = { attendee: null, memberships: [], checkIns: [] };
const profile: MyProfile = {
  ...emptyProfile,
  memberships: [
    membership('acm', 'ACM'),
    membership('ieee', 'IEEE'),
    membership('shpe', 'SHPE'),
    membership('swe', 'SWE'),
    membership('nsbe', 'NSBE'),
    membership('wece', 'WECE'),
  ],
  checkIns: [
    { orgId: 'acm', startTime: '2027-02-01T20:00:00Z' },
    { orgId: 'acm', startTime: '2027-02-08T20:00:00Z' },
    { orgId: 'acm', startTime: '2027-02-15T20:00:00Z' },
    { orgId: 'ieee', startTime: '2027-02-01T20:00:00Z' },
    { orgId: 'acm', startTime: '2026-10-01T20:00:00Z' },
  ],
};

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2027-03-01T17:00:00Z') });
  mockGetMyProfile.mockReset();
  mockSignOut.mockClear();
});

afterEach(() => jest.useRealTimers());

it('shows semester badges and event counts and updates both when the semester changes', async () => {
  mockGetMyProfile.mockResolvedValue(profile);
  await render(<ProfileScreen />);

  expect(await screen.findByLabelText('ACM: earned, 3 events')).toBeTruthy();
  expect(screen.getByLabelText('IEEE: not earned, 1 of 3')).toBeTruthy();
  expect(screen.getByTestId('badge-progress-ieee')).toBeTruthy();
  expect(screen.getAllByText('3 events')).toHaveLength(2);
  await fireEvent.press(screen.getByRole('button', { name: 'See all 6 orgs' }));
  expect(screen.getByText('WECE')).toBeTruthy();
  expect(screen.queryByLabelText(/^WECE:/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Show less' }));

  await fireEvent.press(screen.getByRole('button', { name: 'See all 5 badges' }));
  expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Show less' }));
  expect(screen.getByRole('button', { name: 'See all 5 badges' })).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Fall 2026' }));
  expect(screen.getByLabelText('ACM: not earned, 1 of 3')).toBeTruthy();
  expect(screen.queryByTestId('badge-progress-acm')).toBeNull();
  expect(screen.getByText('0 earned · 5 not earned')).toBeTruthy();
  expect(screen.getByText('1 event')).toBeTruthy();
  expect(screen.queryByText('3 events')).toBeNull();
});

it('shows the empty state and still allows sign out', async () => {
  mockGetMyProfile.mockResolvedValue(emptyProfile);
  await render(<ProfileScreen />);

  expect(await screen.findByText("You haven't checked in anywhere yet")).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});

it('retries loading the profile after an error', async () => {
  mockGetMyProfile.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(profile);
  await render(<ProfileScreen />);

  expect(await screen.findByText("Couldn't load your profile")).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('ACM: earned, 3 events')).toBeTruthy();
});

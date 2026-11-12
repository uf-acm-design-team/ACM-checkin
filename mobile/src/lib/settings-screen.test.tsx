import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import SettingsScreen from '@/app/settings';

const mockSignOut = jest.fn();
const mockSetProfileImage = jest.fn<Promise<void>, [{ file: string }]>();
const mockPick = jest.fn();

jest.mock('@clerk/expo', () => ({
  useUser: () => ({
    user: {
      firstName: 'Jaedyn',
      hasImage: false,
      primaryEmailAddress: { emailAddress: 'jaedyn@example.com' },
      setProfileImage: (input: { file: string }) => mockSetProfileImage(input),
    },
  }),
  useClerk: () => ({ signOut: mockSignOut }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: () => mockPick() }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

beforeEach(() => {
  mockSignOut.mockClear();
  mockSetProfileImage.mockReset().mockResolvedValue();
  mockPick.mockReset();
});

it('signs out', async () => {
  await render(<SettingsScreen />);

  expect(screen.getByText('jaedyn@example.com')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});

it('saves the photo you pick to your account', async () => {
  mockPick.mockResolvedValue({ canceled: false, assets: [{ base64: 'abc', mimeType: 'image/png' }] });
  await render(<SettingsScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'Add a photo' }));
  await waitFor(() => expect(mockSetProfileImage).toHaveBeenCalledWith({ file: 'data:image/png;base64,abc' }));
});

it('changes nothing when you cancel the picker', async () => {
  mockPick.mockResolvedValue({ canceled: true, assets: null });
  await render(<SettingsScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'Add a photo' }));
  await waitFor(() => expect(mockPick).toHaveBeenCalled());
  expect(mockSetProfileImage).not.toHaveBeenCalled();
});

it('says so when the photo could not be saved', async () => {
  mockPick.mockResolvedValue({ canceled: false, assets: [{ base64: 'abc', mimeType: 'image/png' }] });
  mockSetProfileImage.mockRejectedValue(new Error('too big'));
  await render(<SettingsScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'Add a photo' }));
  expect(await screen.findByText('Couldn’t save that photo. Try again.')).toBeTruthy();
});

it('asks before deleting, and deletes nothing yet', async () => {
  await render(<SettingsScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
  expect(await screen.findByText('Delete your account?')).toBeTruthy();

  const [, confirm] = screen.getAllByRole('button', { name: 'Delete account' });
  await fireEvent.press(confirm);
  expect(await screen.findByText(/Nothing was deleted/)).toBeTruthy();
  expect(mockSignOut).not.toHaveBeenCalled();
});

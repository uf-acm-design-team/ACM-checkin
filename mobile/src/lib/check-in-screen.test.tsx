import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import CheckInScreen from '@/app/(tabs)/check-in';

// A fake camera: renders nothing, but lets a test "scan" a QR code.
let scan: ((result: { data: string }) => void) | undefined;
let mockPermission: { granted: boolean; canAskAgain: boolean } | null = null;
const mockRequestPermission = jest.fn();
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [mockPermission, mockRequestPermission],
  CameraView: (props: { onBarcodeScanned?: (r: { data: string }) => void }) => {
    scan = props.onBarcodeScanned;
    return null;
  },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useIsFocused: () => true,
}));

jest.mock('@/lib/checkin-link', () => ({
  parseCheckinLink: (data: string) => (data === 'https://acm-checkin.vercel.app/acm/checkin' ? 'acm' : null),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

beforeEach(() => {
  jest.useFakeTimers();
  scan = undefined;
  mockPush.mockReset();
  mockRequestPermission.mockReset();
});
afterEach(() => jest.useRealTimers());

describe('camera permission', () => {
  it('asks for the camera when it has not been decided yet', async () => {
    mockPermission = { granted: false, canAskAgain: true };
    await render(<CheckInScreen />);
    expect(screen.getByText('Allow camera access')).toBeTruthy();

    await fireEvent.press(screen.getByText('Allow camera'));
    expect(mockRequestPermission).toHaveBeenCalled();
  });

  it('sends the user to Settings when access was denied', async () => {
    mockPermission = { granted: false, canAskAgain: false };
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await render(<CheckInScreen />);
    expect(screen.getByText('Camera access is turned off')).toBeTruthy();

    await fireEvent.press(screen.getByText('Open Settings'));
    expect(openSettings).toHaveBeenCalled();
  });
});

describe('scanning', () => {
  beforeEach(() => {
    mockPermission = { granted: true, canAskAgain: true };
  });

  it('opens check-in for the org on a valid code', async () => {
    await render(<CheckInScreen />);
    await act(() => scan?.({ data: 'https://acm-checkin.vercel.app/acm/checkin' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/checkin/[orgSlug]', params: { orgSlug: 'acm' } });
  });

  it('handles a code once even though the camera reports it many times', async () => {
    await render(<CheckInScreen />);
    await act(() => {
      scan?.({ data: 'https://acm-checkin.vercel.app/acm/checkin' });
      scan?.({ data: 'https://acm-checkin.vercel.app/acm/checkin' });
    });
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("says it isn't a check-in code, then lets the user scan again", async () => {
    await render(<CheckInScreen />);
    await act(() => scan?.({ data: 'https://example.com/menu' }));

    expect(screen.getByText("This isn't a check-in code")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();

    await act(() => jest.advanceTimersByTime(2500));
    expect(screen.queryByText("This isn't a check-in code")).toBeNull();

    await act(() => scan?.({ data: 'https://acm-checkin.vercel.app/acm/checkin' }));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});

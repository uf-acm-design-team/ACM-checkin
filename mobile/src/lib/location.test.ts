import { getCheckInLocation } from './location';

const mockRequestPermission = jest.fn();
const mockGetPosition = jest.fn();
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: () => mockRequestPermission(),
  getCurrentPositionAsync: (options: unknown) => mockGetPosition(options),
}));

beforeEach(() => {
  mockRequestPermission.mockReset();
  mockGetPosition.mockReset();
});

it('returns the fix once permission is granted', async () => {
  mockRequestPermission.mockResolvedValue({ granted: true, canAskAgain: true });
  mockGetPosition.mockResolvedValue({ coords: { latitude: 29.64, longitude: -82.35, accuracy: 12 } });

  await expect(getCheckInLocation()).resolves.toEqual({
    ok: true,
    location: { latitude: 29.64, longitude: -82.35, accuracy: 12 },
  });
  expect(mockGetPosition).toHaveBeenCalledWith({ accuracy: 4 });
});

it('reports a denied permission without asking for a fix', async () => {
  mockRequestPermission.mockResolvedValue({ granted: false, canAskAgain: false });

  await expect(getCheckInLocation()).resolves.toEqual({
    ok: false,
    failure: { kind: 'denied', canAskAgain: false },
  });
  expect(mockGetPosition).not.toHaveBeenCalled();
});

it('reports location as unavailable when the fix fails', async () => {
  mockRequestPermission.mockResolvedValue({ granted: true, canAskAgain: true });
  mockGetPosition.mockRejectedValue(new Error('Location services are disabled'));

  const result = await getCheckInLocation();
  expect(result).toMatchObject({ ok: false, failure: { kind: 'unavailable' } });
});

it('gives up after the timeout', async () => {
  mockRequestPermission.mockResolvedValue({ granted: true, canAskAgain: true });
  mockGetPosition.mockReturnValue(new Promise(() => {}));

  await expect(getCheckInLocation(10)).resolves.toEqual({ ok: false, failure: { kind: 'timeout' } });
});

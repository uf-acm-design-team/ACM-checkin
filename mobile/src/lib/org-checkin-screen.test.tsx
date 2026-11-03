import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import OrgCheckInScreen from '@/app/checkin/[orgSlug]';
import { colors } from '@/theme';

const mockGetOrgBySlug = jest.fn();
const mockGetOpenMeetings = jest.fn();
const mockCallMemberCheckIn = jest.fn();
const mockSupabase = { client: {} };

jest.mock('@/lib/supabase', () => {
  class CheckInNetworkError extends Error {}
  return {
    CheckInNetworkError,
    getOrgBySlug: (...args: unknown[]) => mockGetOrgBySlug(...args),
    getOpenMeetings: (...args: unknown[]) => mockGetOpenMeetings(...args),
    callMemberCheckIn: (...args: unknown[]) => mockCallMemberCheckIn(...args),
    useSupabase: () => mockSupabase,
  };
});

const mockRequestLocation = jest.fn();
const mockGetPosition = jest.fn();
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: () => mockRequestLocation(),
  getCurrentPositionAsync: () => mockGetPosition(),
}));

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

type Meeting = {
  id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  is_geo_locked: boolean;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  requires_checkin_password: boolean | null;
  form_schema: unknown[];
};

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: 'meeting-1',
    title: 'General Body Meeting',
    description: 'CSE A101',
    start_time: '2026-11-03T23:00:00Z',
    end_time: '2026-11-04T00:30:00Z',
    is_geo_locked: false,
    latitude: null,
    longitude: null,
    radius_meters: null,
    requires_checkin_password: false,
    form_schema: [],
    ...overrides,
  };
}

const geoLocked = { is_geo_locked: true, latitude: 29.6436, longitude: -82.3549, radius_meters: 200 };
const checkedIn = { status: 200, reply: { ok: true, meetingId: 'meeting-1', alreadyCheckedIn: false } };

beforeEach(() => {
  mockGetOrgBySlug.mockReset().mockResolvedValue(acm);
  mockGetOpenMeetings.mockReset().mockResolvedValue([meeting()]);
  mockCallMemberCheckIn.mockReset().mockResolvedValue(checkedIn);
  mockRequestLocation.mockReset();
  mockGetPosition.mockReset();
  mockBack.mockReset();
});

/** Render, and wait until the org and its meetings have loaded. */
async function renderScreen() {
  await render(<OrgCheckInScreen />);
  await waitFor(() => expect(screen.getByText('ACM')).toBeTruthy());
  await waitFor(() => expect(screen.queryByText('Finding open meetings…')).toBeNull());
}

async function pressCheckIn() {
  await fireEvent.press(screen.getByText('Check in'));
}

/** The body of the one call to member-check-in. */
function sentRequest() {
  expect(mockCallMemberCheckIn).toHaveBeenCalledTimes(1);
  const [client, request] = mockCallMemberCheckIn.mock.calls[0];
  expect(client).toBe(mockSupabase);
  return request;
}

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
    expect(mockGetOpenMeetings).not.toHaveBeenCalled();
  });

  it('shows a load error with Try again', async () => {
    mockGetOrgBySlug.mockRejectedValueOnce(new Error('getOrgBySlug: fetch failed')).mockResolvedValueOnce(acm);
    await render(<OrgCheckInScreen />);
    await waitFor(() => expect(screen.getByText('Couldn’t load this club')).toBeTruthy());
    expect(screen.getByText('getOrgBySlug: fetch failed')).toBeTruthy();

    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByText('ACM')).toBeTruthy());
  });

  it('goes back to the scanner', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Scan another code'));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('choosing a meeting', () => {
  it("loads the org's open meetings", async () => {
    await renderScreen();
    expect(mockGetOpenMeetings).toHaveBeenCalledWith(mockSupabase, 'org-1');
  });

  it('says so when no meeting is open, and can check again', async () => {
    mockGetOpenMeetings.mockResolvedValueOnce([]).mockResolvedValueOnce([meeting()]);
    await renderScreen();
    expect(screen.getByText('No meeting is open right now')).toBeTruthy();
    expect(screen.queryByText('Check in')).toBeNull();

    await fireEvent.press(screen.getByText('Check again'));
    await waitFor(() => expect(screen.getByText('General Body Meeting')).toBeTruthy());
    expect(mockGetOpenMeetings).toHaveBeenCalledTimes(2);
  });

  it('shows a meeting load error with Try again', async () => {
    mockGetOpenMeetings.mockRejectedValueOnce(new Error('getOpenMeetings: fetch failed'));
    await renderScreen();
    expect(screen.getByText('Couldn’t load meetings')).toBeTruthy();

    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByText('General Body Meeting')).toBeTruthy());
  });

  it('skips the picker when exactly one meeting is open', async () => {
    await renderScreen();
    expect(screen.queryByText('Choose a meeting')).toBeNull();
    expect(screen.getByText('General Body Meeting')).toBeTruthy();
    expect(screen.queryByText('Not this one? Choose a different meeting')).toBeNull();

    await pressCheckIn();
    await waitFor(() => expect(screen.getByText('Checked in')).toBeTruthy());
    expect(sentRequest()).toEqual({ orgSlug: 'acm', meetingId: 'meeting-1', answers: {} });
  });

  it('asks which meeting when several are open, and checks into the one picked', async () => {
    mockGetOpenMeetings.mockResolvedValue([
      meeting({ id: 'meeting-1', title: 'General Body Meeting' }),
      meeting({ id: 'meeting-2', title: 'Officer Workshop', requires_checkin_password: true }),
    ]);
    await renderScreen();
    expect(screen.getByText('Choose a meeting')).toBeTruthy();
    expect(screen.queryByText('Check in')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Check in to General Body Meeting'));
    expect(screen.queryByText('Choose a meeting')).toBeNull();

    // A wrong pick isn't a dead end.
    await fireEvent.press(screen.getByText('Not this one? Choose a different meeting'));
    expect(screen.getByText('Choose a meeting')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Check in to Officer Workshop'));
    await fireEvent.changeText(screen.getByPlaceholderText('Shown at the front of the room'), 'room42');
    await pressCheckIn();
    await waitFor(() => expect(screen.getByText('Checked in')).toBeTruthy());
    expect(sentRequest()).toMatchObject({ meetingId: 'meeting-2', password: 'room42' });
  });
});

describe('meeting password', () => {
  it('is not asked for when the meeting has none', async () => {
    await renderScreen();
    expect(screen.queryByText('Meeting password')).toBeNull();

    await pressCheckIn();
    await waitFor(() => expect(mockCallMemberCheckIn).toHaveBeenCalled());
    expect(sentRequest()).not.toHaveProperty('password');
  });

  it('is required when the meeting has one', async () => {
    mockGetOpenMeetings.mockResolvedValue([meeting({ requires_checkin_password: true })]);
    await renderScreen();
    expect(screen.getByText('Meeting password')).toBeTruthy();

    await pressCheckIn();
    expect(screen.getByText('Enter the meeting password.')).toBeTruthy();
    expect(mockCallMemberCheckIn).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByPlaceholderText('Shown at the front of the room'), 'room42');
    await pressCheckIn();
    await waitFor(() => expect(screen.getByText('Checked in')).toBeTruthy());
    expect(sentRequest()).toMatchObject({ password: 'room42' });
  });

  it('marks the field when the server says the password is wrong', async () => {
    mockGetOpenMeetings.mockResolvedValue([meeting({ requires_checkin_password: true })]);
    mockCallMemberCheckIn.mockResolvedValue({
      status: 403,
      reply: { ok: false, code: 'wrong_password', error: 'Incorrect meeting password.' },
    });
    await renderScreen();
    await fireEvent.changeText(screen.getByPlaceholderText('Shown at the front of the room'), 'nope');
    await pressCheckIn();

    await waitFor(() => expect(screen.getByText('Wrong meeting password')).toBeTruthy());
    expect(screen.getByText('That’s not the password for this meeting.')).toBeTruthy();
    expect(screen.getByText('Check in')).toBeTruthy();
  });
});

describe("the meeting's questions", () => {
  const form_schema = [
    { id: 'name', type: 'short_text', label: 'Preferred name', required: true },
    { id: 'notes', type: 'long_text', label: 'Anything else?', required: false },
    { id: 'year', type: 'multiple_choice', label: 'Year', required: true, options: ['1st', '2nd'] },
    { id: 'topics', type: 'checkboxes', label: 'Topics', required: true, options: ['AI', 'Web', 'Mobile'] },
    { id: 'major', type: 'dropdown', label: 'Major', required: false, options: ['CS', 'CE'] },
    { id: 'rating', type: 'scale', label: 'Rate it', required: true, scale: { min: 1, max: 5 } },
  ];

  beforeEach(() => {
    mockGetOpenMeetings.mockResolvedValue([meeting({ form_schema })]);
  });

  it('renders every question with a control for its type', async () => {
    await renderScreen();
    expect(screen.getByText('6 questions')).toBeTruthy();
    expect(screen.getByLabelText('Preferred name')).toBeTruthy();
    expect(screen.getByLabelText('Anything else?')).toBeTruthy();
    expect(screen.getAllByRole('radio').map((el) => el.props.accessibilityLabel)).toEqual(['1st', '2nd', 'CS', 'CE']);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByLabelText('Rate it: 5')).toBeTruthy();
  });

  it('blocks check-in until the required ones are answered', async () => {
    await renderScreen();
    await pressCheckIn();

    expect(mockCallMemberCheckIn).not.toHaveBeenCalled();
    expect(screen.getByText('Answer the required questions before checking in.')).toBeTruthy();
    expect(screen.getByText('This question is required.')).toBeTruthy();
    expect(screen.getByText('Select an option.')).toBeTruthy();
    expect(screen.getByText('Select at least one option.')).toBeTruthy();
    expect(screen.getByText('Pick a value.')).toBeTruthy();
  });

  it('sends the answers, keyed by question id', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Preferred name'), '  Ada ');
    await fireEvent.press(screen.getByLabelText('2nd'));
    await fireEvent.press(screen.getByLabelText('Mobile'));
    await fireEvent.press(screen.getByLabelText('AI'));
    await fireEvent.press(screen.getByLabelText('Rate it: 4'));

    await pressCheckIn();
    await waitFor(() => expect(screen.getByText('Checked in')).toBeTruthy());
    expect(sentRequest()).toEqual({
      orgSlug: 'acm',
      meetingId: 'meeting-1',
      answers: { name: 'Ada', year: '2nd', topics: ['AI', 'Mobile'], rating: 4 },
    });
  });

  it('clears a question’s error once it is answered', async () => {
    await renderScreen();
    await pressCheckIn();
    expect(screen.getByText('This question is required.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Preferred name'), 'Ada');
    expect(screen.queryByText('This question is required.')).toBeNull();
    expect(screen.getByText('Pick a value.')).toBeTruthy();
  });

  it("shows the server's answer errors on the questions", async () => {
    mockGetOpenMeetings.mockResolvedValue([
      meeting({ form_schema: [{ id: 'name', type: 'short_text', label: 'Preferred name', required: false }] }),
    ]);
    mockCallMemberCheckIn.mockResolvedValue({
      status: 422,
      reply: {
        ok: false,
        code: 'invalid_answers',
        error: 'Answer the required questions before checking in.',
        answerErrors: { name: 'This question is required.' },
      },
    });
    await renderScreen();
    await pressCheckIn();

    await waitFor(() => expect(screen.getByText('Check your answers')).toBeTruthy());
    expect(screen.getByText('This question is required.')).toBeTruthy();
  });
});

describe('location', () => {
  it('is never asked for when the meeting is not geo-locked', async () => {
    await renderScreen();
    await pressCheckIn();
    await waitFor(() => expect(screen.getByText('Checked in')).toBeTruthy());

    expect(mockRequestLocation).not.toHaveBeenCalled();
    expect(sentRequest()).not.toHaveProperty('latitude');
  });

  it('is not asked for a geo-locked meeting with no pin', async () => {
    mockGetOpenMeetings.mockResolvedValue([meeting({ is_geo_locked: true })]);
    await renderScreen();
    await pressCheckIn();
    await waitFor(() => expect(screen.getByText('Checked in')).toBeTruthy());
    expect(mockRequestLocation).not.toHaveBeenCalled();
  });

  it('is asked for on Check in, not on opening, and sent with the check-in', async () => {
    mockGetOpenMeetings.mockResolvedValue([meeting(geoLocked)]);
    mockRequestLocation.mockResolvedValue({ granted: true, canAskAgain: true });
    mockGetPosition.mockResolvedValue({ coords: { latitude: 29.6437, longitude: -82.3548, accuracy: 10 } });
    await renderScreen();
    expect(screen.getByText(/the app asks for your location/)).toBeTruthy();
    expect(mockRequestLocation).not.toHaveBeenCalled();

    await pressCheckIn();
    await waitFor(() => expect(screen.getByText('Checked in')).toBeTruthy());
    expect(mockRequestLocation).toHaveBeenCalledTimes(1);
    expect(sentRequest()).toEqual({
      orgSlug: 'acm',
      meetingId: 'meeting-1',
      answers: {},
      latitude: 29.6437,
      longitude: -82.3548,
    });
  });

  it('explains a denied permission and does not check in', async () => {
    mockGetOpenMeetings.mockResolvedValue([meeting(geoLocked)]);
    mockRequestLocation.mockResolvedValue({ granted: false, canAskAgain: false });
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await renderScreen();
    await pressCheckIn();

    await waitFor(() => expect(screen.getByText('Location access is off')).toBeTruthy());
    expect(mockCallMemberCheckIn).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Open Settings'));
    expect(openSettings).toHaveBeenCalled();
  });

  it('shows how far away the server says the member is', async () => {
    mockGetOpenMeetings.mockResolvedValue([meeting(geoLocked)]);
    mockRequestLocation.mockResolvedValue({ granted: true, canAskAgain: true });
    mockGetPosition.mockResolvedValue({ coords: { latitude: 29.66, longitude: -82.35, accuracy: 10 } });
    mockCallMemberCheckIn.mockResolvedValue({
      status: 403,
      reply: {
        ok: false,
        code: 'outside_geofence',
        error: 'You’re 340 m outside the check-in area.',
        geo: { kind: 'too_far', metresAway: 340, radius: 200 },
      },
    });
    await renderScreen();
    await pressCheckIn();

    await waitFor(() => expect(screen.getByText('You’re not at the meeting')).toBeTruthy());
    expect(screen.getByText('You’re 340 m outside the check-in area.')).toBeTruthy();
    expect(screen.getByText(/within 200 m of the meeting/)).toBeTruthy();
  });
});

describe('the reply', () => {
  async function checkInWith(result: unknown) {
    mockCallMemberCheckIn.mockResolvedValue(result);
    await renderScreen();
    await pressCheckIn();
  }

  it('shows success and hides the form', async () => {
    await checkInWith(checkedIn);
    await waitFor(() => expect(screen.getByText('Checked in')).toBeTruthy());
    expect(screen.getByText('You’re checked in to General Body Meeting.')).toBeTruthy();
    expect(screen.queryByText('Check in')).toBeNull();
  });

  it('shows progress toward membership when the server sends it', async () => {
    await checkInWith({ ...checkedIn, reply: { ...checkedIn.reply, membership: { attended: 2, threshold: 5 } } });
    await waitFor(() => expect(screen.getByText('2 of 5 meetings toward membership.')).toBeTruthy());
  });

  it('shows already-checked-in as a success', async () => {
    await checkInWith({ status: 200, reply: { ok: true, meetingId: 'meeting-1', alreadyCheckedIn: true } });
    await waitFor(() => expect(screen.getByText('You’re already checked in')).toBeTruthy());
  });

  it("shows the stub's not_implemented reply", async () => {
    await checkInWith({ status: 501, reply: { ok: false, code: 'not_implemented', error: 'not implemented' } });
    await waitFor(() => expect(screen.getByText('Check-in isn’t available yet')).toBeTruthy());
  });

  it('asks the user to sign in again when unauthenticated', async () => {
    await checkInWith({ status: 401, reply: { ok: false, code: 'unauthenticated', error: 'You need to be signed in.' } });
    await waitFor(() => expect(screen.getByText('Please sign in again')).toBeTruthy());
  });

  // Several codes share a status (403 = no_profile, wrong_password, outside_geofence),
  // so the screen must branch on `code`, not the number.
  it.each([
    ['no_profile', 'Finish your profile first'],
    ['wrong_password', 'Wrong meeting password'],
  ])('tells apart 403 %s', async (code, title) => {
    await checkInWith({ status: 403, reply: { ok: false, code, error: 'Not allowed.' } });
    await waitFor(() => expect(screen.getByText(title)).toBeTruthy());
  });

  it('offers to refresh when the meeting closed in the meantime', async () => {
    await checkInWith({ status: 409, reply: { ok: false, code: 'meeting_closed', error: 'That meeting is no longer open.' } });
    await waitFor(() => expect(screen.getByText('No meeting is open right now')).toBeTruthy());

    mockGetOpenMeetings.mockResolvedValue([]);
    await fireEvent.press(screen.getByText('Refresh meetings'));
    await waitFor(() => expect(mockGetOpenMeetings).toHaveBeenCalledTimes(2));
  });

  it('lists each field the server rejected', async () => {
    await checkInWith({
      status: 400,
      reply: {
        ok: false,
        code: 'invalid_request',
        error: 'Invalid check-in request. See fieldErrors.',
        fieldErrors: { meetingId: 'Expected a meeting UUID.' },
      },
    });
    await waitFor(() => expect(screen.getByText('Check-in failed')).toBeTruthy());
    expect(screen.getByText('meetingId: Expected a meeting UUID.')).toBeTruthy();
  });

  it('explains when the function itself is not running', async () => {
    await checkInWith({ status: 404, reply: null });
    await waitFor(() => expect(screen.getByText('Check-in service unavailable')).toBeTruthy());
    expect(screen.getByText(/npm run dev:functions/)).toBeTruthy();
  });

  it('shows a network error when the server is unreachable', async () => {
    const { CheckInNetworkError } = jest.requireMock('@/lib/supabase');
    mockCallMemberCheckIn.mockRejectedValue(new CheckInNetworkError('Network request failed'));
    await renderScreen();
    await pressCheckIn();
    await waitFor(() => expect(screen.getByText('Couldn’t reach the server')).toBeTruthy());
  });
});

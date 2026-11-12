import { fireEvent, render, screen } from '@testing-library/react-native';

import { MeetingDetails } from '@/components/meeting-details';
import type { MeetingCheckIn, OrgMeeting } from '@/lib/supabase';

const mockGetMyMeetingCheckIn = jest.fn<Promise<MeetingCheckIn>, [unknown, string]>();
const mockSupabase = {};

jest.mock('@/lib/supabase', () => ({
  useSupabase: () => mockSupabase,
  getMyMeetingCheckIn: (supabase: unknown, id: string) => mockGetMyMeetingCheckIn(supabase, id),
}));

// 1 PM in Gainesville on Nov 3.
const now = '2026-11-03T18:00:00Z';

const attended: OrgMeeting = {
  id: 'm1',
  title: 'General Body Meeting',
  startTime: '2026-10-30T23:00:00Z',
  attended: true,
  description: 'Officer updates and free pizza.',
  questions: [
    { id: 'q1', label: 'How did you hear about this meeting?' },
    { id: 'q2', label: 'Anything else?' },
  ],
};

const noCheckIn: MeetingCheckIn = { endTime: null, checkedInAt: null, answers: {} };

beforeEach(() => mockGetMyMeetingCheckIn.mockReset().mockResolvedValue(noCheckIn));

it('shows when you checked in, the time range, description and the answers you gave', async () => {
  mockGetMyMeetingCheckIn.mockResolvedValue({
    endTime: '2026-10-31T00:30:00Z',
    checkedInAt: '2026-10-30T23:04:00Z',
    answers: { q1: 'Discord' },
  });
  await render(<MeetingDetails meeting={attended} orgName="ACM" now={now} onClose={() => {}} />);

  expect(screen.getByText('General Body Meeting')).toBeTruthy();
  expect(screen.getByText('ACM')).toBeTruthy();
  expect(screen.getByText('Friday, October 30, 2026')).toBeTruthy();
  expect(screen.getByText('Officer updates and free pizza.')).toBeTruthy();
  expect(await screen.findByText('Checked in at 7:04 PM')).toBeTruthy();
  expect(screen.getByText('7:00 PM – 8:30 PM')).toBeTruthy();
  expect(screen.getByText('How did you hear about this meeting?')).toBeTruthy();
  expect(screen.getByText('Discord')).toBeTruthy();
  // Skipped questions are left out.
  expect(screen.queryByText('Anything else?')).toBeNull();
  expect(mockGetMyMeetingCheckIn).toHaveBeenCalledWith(mockSupabase, 'm1');
});

it('tells you how far off an upcoming meeting is and how to check in', async () => {
  const upcoming = { ...attended, id: 'm2', attended: false, startTime: '2026-11-12T23:30:00Z', questions: [] };
  await render(<MeetingDetails meeting={upcoming} orgName="ACM" now={now} onClose={() => {}} />);

  expect(screen.getByText('In 9 days')).toBeTruthy();
  expect(screen.getByText(/Scan the QR code at the meeting to check in\. It counts toward Fall 2026\./)).toBeTruthy();
});

it('marks a past meeting you did not check in to as missed', async () => {
  await render(<MeetingDetails meeting={{ ...attended, attended: false }} orgName="ACM" now={now} onClose={() => {}} />);

  expect(screen.getByText('Missed')).toBeTruthy();
  expect(screen.queryByText(/Scan the QR code/)).toBeNull();
});

it('closes from the close button', async () => {
  const onClose = jest.fn();
  await render(<MeetingDetails meeting={attended} orgName="ACM" now={now} onClose={onClose} />);

  await fireEvent.press(screen.getByLabelText('Close'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('renders nothing while no meeting is picked', async () => {
  await render(<MeetingDetails meeting={null} orgName="ACM" now={now} onClose={() => {}} />);

  expect(screen.queryByText('General Body Meeting')).toBeNull();
  expect(mockGetMyMeetingCheckIn).not.toHaveBeenCalled();
});

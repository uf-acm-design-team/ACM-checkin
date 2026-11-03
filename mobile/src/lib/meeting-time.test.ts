import { isWithinMeetingWindow as webIsWithinMeetingWindow } from '../../../supabase/functions/_shared/meeting-time';
import { isWithinMeetingWindow } from './meeting-time';

const start = '2026-11-03T19:00:00+00:00';
const end = '2026-11-03T20:00:00+00:00';

describe('isWithinMeetingWindow', () => {
  it.each([
    ['before the start', '2026-11-03T18:59:00Z', start, end, false],
    ['at the start', '2026-11-03T19:00:00Z', start, end, true],
    ['during', '2026-11-03T19:30:00Z', start, end, true],
    ['at the end', '2026-11-03T20:00:00Z', start, end, true],
    ['after the end', '2026-11-03T20:01:00Z', start, end, false],
    ['with no start', '2026-11-03T08:00:00Z', null, end, true],
    ['with no end', '2026-11-04T08:00:00Z', start, null, true],
    ['with no bounds', '2026-11-04T08:00:00Z', null, null, true],
  ])('%s', (_, now, startTime, endTime, expected) => {
    expect(isWithinMeetingWindow(new Date(now), startTime, endTime)).toBe(expected);
    // Same answer as web's copy, which the server filters with.
    expect(webIsWithinMeetingWindow(new Date(now), startTime, endTime)).toBe(expected);
  });
});

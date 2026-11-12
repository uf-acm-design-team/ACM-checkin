import { daysAway, formatAnswer, nextMeeting } from './meeting-details';

describe('daysAway', () => {
  // 1 PM in Gainesville on Nov 3.
  const now = '2026-11-03T18:00:00Z';

  it.each([
    ['2026-11-04T00:00:00Z', 'Today'], // 7 PM the same evening
    ['2026-11-05T00:00:00Z', 'Tomorrow'], // 7 PM the next evening, 30 hours away
    ['2026-11-12T23:30:00Z', 'In 9 days'],
    ['2026-11-01T23:00:00Z', 'Today'], // already started or past
  ])('%s is %s', (start, label) => {
    expect(daysAway(start, now)).toBe(label);
  });
});

describe('formatAnswer', () => {
  it.each([
    ['Discord', 'Discord'],
    [4, '4'],
    [true, 'Yes'],
    [false, 'No'],
    [['Web', 'AI'], 'Web, AI'],
    ['  ', ''],
    [null, ''],
    [undefined, ''],
    [{}, ''],
  ])('%p becomes %p', (value, text) => {
    expect(formatAnswer(value)).toBe(text);
  });
});

describe('nextMeeting', () => {
  const now = '2026-11-12T18:00:00Z';
  const past = { id: 'past', startTime: '2026-11-05T23:00:00Z' };
  const open = { id: 'open', startTime: '2026-11-12T17:00:00Z' };
  const soon = { id: 'soon', startTime: '2026-11-17T23:00:00Z' };
  const later = { id: 'later', startTime: '2026-11-19T23:00:00Z' };

  it('picks the soonest meeting that has not started', () => {
    expect(nextMeeting([later, past, soon], new Set(), now)).toBe(soon);
  });

  it('puts a live meeting ahead of an upcoming one', () => {
    expect(nextMeeting([soon, open], new Set(['open']), now)).toBe(open);
  });

  it('is null when nothing is live or ahead', () => {
    expect(nextMeeting([past, open], new Set(), now)).toBeNull();
  });
});

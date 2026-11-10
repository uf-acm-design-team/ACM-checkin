import { daysAway, formatAnswer } from './meeting-details';

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

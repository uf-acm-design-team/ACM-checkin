import { addMonths, monthGrid, monthLabel } from './calendar';

const NOW = '2026-11-09T17:00:00Z';

const meetings = [
  { title: 'Workshop', startTime: '2026-11-03T23:00:00Z', attended: true },
  { title: 'GBM', startTime: '2026-11-05T23:30:00Z', attended: false },
  { title: 'Resume workshop', startTime: '2026-11-12T23:00:00Z', attended: false },
  // 11 PM Nov 30 in Gainesville is Dec 1 in UTC; it still belongs to November.
  { title: 'Late night', startTime: '2026-12-01T04:00:00Z', attended: false },
  { title: 'Social', startTime: '2026-12-03T23:30:00Z', attended: false },
];

describe('monthGrid', () => {
  const cells = monthGrid({ year: 2026, month: 11 }, meetings, NOW);
  const day = (n: number) => cells.find((cell) => cell?.day === n);

  it('starts the month on the right weekday', () => {
    // November 1, 2026 is a Sunday.
    expect(cells[0]?.day).toBe(1);
    expect(cells.filter(Boolean)).toHaveLength(30);
  });

  it('marks attended, missed and upcoming days', () => {
    expect(day(3)?.status).toBe('attended');
    expect(day(5)?.status).toBe('missed');
    expect(day(12)?.status).toBe('upcoming');
    expect(day(4)?.status).toBeNull();
  });

  it('files meetings by the org calendar, not UTC', () => {
    expect(day(30)?.titles).toEqual(['Late night']);
    expect(cells.some((cell) => cell?.titles.includes('Social'))).toBe(false);
  });

  it('marks today', () => {
    expect(cells.filter((cell) => cell?.isToday).map((cell) => cell?.day)).toEqual([9]);
  });

  it('pads the first week with blanks', () => {
    const december = monthGrid({ year: 2026, month: 12 }, [], NOW);
    // December 1, 2026 is a Tuesday.
    expect(december.slice(0, 3)).toEqual([null, null, expect.objectContaining({ day: 1 })]);
  });
});

describe('addMonths', () => {
  it('rolls over the year in both directions', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 });
  });
});

describe('monthLabel', () => {
  it('names the month', () => {
    expect(monthLabel({ year: 2027, month: 1 })).toBe('January 2027');
  });
});

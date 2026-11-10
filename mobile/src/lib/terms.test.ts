import { academicYearTerms, getTerm, termBounds } from './terms';

describe('getTerm', () => {
  it('uses the org calendar, not UTC, at the new year', () => {
    // 11 PM Dec 31 in Gainesville is already Jan 1 in UTC.
    expect(getTerm('2027-01-01T04:00:00Z').label).toBe('Fall 2026');
    expect(getTerm('2027-01-01T05:00:00Z').label).toBe('Spring 2027');
  });

  it('puts June and July in Summer', () => {
    expect(getTerm('2026-06-15T16:00:00Z').key).toBe('2026-Summer');
    expect(getTerm('2026-08-01T03:59:00Z').key).toBe('2026-Summer');
  });
});

describe('termBounds', () => {
  it('starts and ends on Eastern midnight', () => {
    expect(termBounds(getTerm('2026-10-01T12:00:00Z'))).toEqual({
      start: '2026-08-01T04:00:00.000Z',
      end: '2027-01-01T04:59:00.000Z',
    });
    expect(termBounds(getTerm('2027-03-01T12:00:00Z'))).toEqual({
      start: '2027-01-01T05:00:00.000Z',
      end: '2027-06-01T03:59:00.000Z',
    });
  });
});

describe('academicYearTerms', () => {
  it('starts the academic year in Fall', () => {
    const keys = ['2026-Fall', '2027-Spring', '2027-Summer'];
    expect(academicYearTerms('2026-11-09T12:00:00Z').map((t) => t.key)).toEqual(keys);
    expect(academicYearTerms('2027-03-01T12:00:00Z').map((t) => t.key)).toEqual(keys);
  });
});

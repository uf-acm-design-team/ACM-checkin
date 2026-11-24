import * as web from '../../../supabase/functions/_shared/form-schema';
import {
  buildCheckInRequest,
  needsLocation,
  parseSchema,
  scalePoints,
  validateAnswers,
  type AnswerMap,
} from './check-in-form';

// One question of every type, plus the malformed shapes parseSchema repairs or drops.
const rawSchema: unknown = [
  { id: 'name', type: 'short_text', label: 'Preferred name', required: true },
  { id: 'notes', type: 'long_text', label: 'Anything else?', required: false },
  { id: 'year', type: 'multiple_choice', label: 'Year', required: true, options: [' 1st ', '2nd', '', 7] },
  { id: 'topics', type: 'checkboxes', label: 'Topics', required: true, options: ['AI', 'Web', 'Mobile'] },
  { id: 'major', type: 'dropdown', label: 'Major', required: false, options: ['CS', 'CE'] },
  { id: 'rating', type: 'scale', label: 'Rate it', required: true, scale: { min: 1, max: 5, min_label: ' Meh ' } },
  { id: 'weird', type: 'not_a_type', label: 'Falls back to short text' },
  { id: 'wide', type: 'scale', label: 'Bad bounds', scale: { min: 9, max: 3 } },
  { id: 'name', type: 'short_text', label: 'Duplicate id is dropped' },
  { type: 'short_text', label: 'No id is dropped' },
  'not an object',
];

describe('parseSchema', () => {
  it('reads questions the same way web does', () => {
    expect(parseSchema(rawSchema)).toEqual(web.parseSchema(rawSchema));
  });

  it('repairs what it can and drops the rest', () => {
    const schema = parseSchema(rawSchema);
    expect(schema.map((q) => q.id)).toEqual(['name', 'notes', 'year', 'topics', 'major', 'rating', 'weird', 'wide']);
    expect(schema.find((q) => q.id === 'year')?.options).toEqual(['1st', '2nd']);
    expect(schema.find((q) => q.id === 'weird')?.type).toBe('short_text');
    expect(schema.find((q) => q.id === 'wide')?.scale).toEqual({ min: 9, max: 10 });
  });

  it('treats anything but an array as no questions', () => {
    expect(parseSchema(null)).toEqual([]);
    expect(parseSchema({ id: 'x' })).toEqual([]);
  });
});

describe('validateAnswers', () => {
  const schema = parseSchema(rawSchema);

  it.each<[string, AnswerMap]>([
    ['nothing answered', {}],
    ['everything answered', { name: ' Ada ', year: '1st', topics: ['Web', 'AI'], rating: 4, major: 'CS' }],
    ['blank text', { name: '   ', year: '2nd', topics: ['AI'], rating: 1 }],
    ['an option that is not listed', { name: 'Ada', year: '3rd', topics: ['Cooking'], rating: 2, major: 'Art' }],
    ['duplicate checkboxes', { name: 'Ada', year: '2nd', topics: ['AI', 'AI'], rating: 3 }],
    ['a scale value out of range', { name: 'Ada', year: '2nd', topics: ['AI'], rating: 6 }],
    ['a scale value that is not whole', { name: 'Ada', year: '2nd', topics: ['AI'], rating: 2.5 }],
    ['text that is too long', { name: 'x'.repeat(501), year: '2nd', topics: ['AI'], rating: 3 }],
  ])('agrees with web: %s', (_, answers) => {
    expect(validateAnswers(schema, answers)).toEqual(web.validateAnswers(schema, answers));
  });

  it('flags each unanswered required question', () => {
    const result = validateAnswers(schema, {});
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual({
      name: 'This question is required.',
      year: 'Select an option.',
      topics: 'Select at least one option.',
      rating: 'Pick a value.',
    });
  });

  it('trims answers and keeps checkboxes in schema order', () => {
    const result = validateAnswers(schema, { name: ' Ada ', year: '1st', topics: ['Mobile', 'AI'], rating: 5 });
    expect(result).toEqual({
      ok: true,
      answers: { name: 'Ada', year: '1st', topics: ['AI', 'Mobile'], rating: 5 },
      errors: {},
    });
  });
});

describe('scalePoints', () => {
  it('lists every point from min to max', () => {
    expect(scalePoints({ min: 0, max: 3 })).toEqual([0, 1, 2, 3]);
  });
});

describe('the request', () => {
  const meeting = {
    id: 'meeting-1',
    is_geo_locked: false,
    latitude: null,
    longitude: null,
    requires_checkin_password: false,
  };
  const here = { latitude: 29.6436, longitude: -82.3549 };

  it('names the meeting and carries the answers', () => {
    expect(buildCheckInRequest({ orgSlug: 'acm', meeting, password: '', answers: { a: 'b' }, location: null })).toEqual({
      orgSlug: 'acm',
      meetingId: 'meeting-1',
      answers: { a: 'b' },
    });
  });

  it('sends the password only when the meeting has one', () => {
    const withPassword = { ...meeting, requires_checkin_password: true };
    expect(buildCheckInRequest({ orgSlug: 'acm', meeting: withPassword, password: 'room42', answers: {}, location: null }))
      .toMatchObject({ password: 'room42' });
    expect(
      buildCheckInRequest({ orgSlug: 'acm', meeting, password: 'stale', answers: {}, location: null }),
    ).not.toHaveProperty('password');
  });

  it('sends latitude and longitude together when there is a fix', () => {
    expect(buildCheckInRequest({ orgSlug: 'acm', meeting, password: '', answers: {}, location: here })).toMatchObject(here);
  });

  it('needs a location only for a geo-locked meeting with a pin', () => {
    expect(needsLocation(meeting)).toBe(false);
    expect(needsLocation({ ...meeting, is_geo_locked: true })).toBe(false);
    expect(needsLocation({ ...meeting, is_geo_locked: true, latitude: 29.6, longitude: -82.3 })).toBe(true);
  });
});

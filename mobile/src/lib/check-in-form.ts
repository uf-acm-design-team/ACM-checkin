/**
 * The check-in form's logic: reading a meeting's questions, checking answers
 * before they are sent, and building the member-check-in request.
 *
 * parseSchema and validateAnswers are copies of the same functions in
 * supabase/functions/_shared/form-schema.ts (web's lib/form-schema.ts
 * re-exports it), which is the source of truth (the builder writes with it
 * and member-check-in validates with it again before saving). Metro can't load
 * files outside mobile/, so only the types are imported; check-in-form.test.ts
 * runs both copies on the same inputs, so a change to the shared rules fails here.
 *
 * Validation here is advisory, for inline errors. The server re-runs it and
 * answers `invalid_answers` with per-question errors if the two ever disagree.
 */
import type {
  AnswerMap,
  FormQuestion,
  FormSchema,
  QuestionType,
  ScaleConfig,
} from '../../../supabase/functions/_shared/form-schema';
import type { MemberCheckInRequest } from './member-check-in';

export type { AnswerMap, AnswerValue, FormQuestion, FormSchema } from '../../../supabase/functions/_shared/form-schema';

const QUESTION_TYPES: readonly QuestionType[] = [
  'short_text',
  'long_text',
  'multiple_choice',
  'checkboxes',
  'dropdown',
  'scale',
];
const CHOICE_TYPES: readonly QuestionType[] = ['multiple_choice', 'checkboxes', 'dropdown'];

const MAX_SHORT_TEXT_LENGTH = 500;
const MAX_LONG_TEXT_LENGTH = 5000;
const SCALE_MIN_FLOOR = 0;
const SCALE_MAX_CEILING = 10;
export const DEFAULT_SCALE: ScaleConfig = { min: 1, max: 5 };

export function isChoiceType(type: QuestionType): boolean {
  return CHOICE_TYPES.includes(type);
}

/**
 * Parse meetings.form_schema (untrusted jsonb) into questions. Lenient, like
 * web: a malformed question is repaired or dropped rather than failing the
 * whole check-in.
 */
export function parseSchema(raw: unknown): FormSchema {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const out: FormSchema = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const q = entry as Record<string, unknown>;

    const id = typeof q.id === 'string' ? q.id.trim() : '';
    // A duplicate id would make two questions share one answer slot.
    if (!id || seen.has(id)) continue;

    const type = QUESTION_TYPES.includes(q.type as QuestionType) ? (q.type as QuestionType) : 'short_text';
    const question: FormQuestion = {
      id,
      type,
      label: typeof q.label === 'string' ? q.label : '',
      required: q.required === true,
    };

    if (isChoiceType(type)) {
      question.options = Array.isArray(q.options)
        ? q.options
            .filter((o): o is string => typeof o === 'string')
            .map((o) => o.trim())
            .filter(Boolean)
        : [];
    }
    if (type === 'scale') question.scale = parseScale(q.scale);

    seen.add(id);
    out.push(question);
  }

  return out;
}

function parseScale(raw: unknown): ScaleConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SCALE };
  const s = raw as Record<string, unknown>;

  const min = Number.isFinite(s.min) ? Math.trunc(s.min as number) : DEFAULT_SCALE.min;
  const max = Number.isFinite(s.max) ? Math.trunc(s.max as number) : DEFAULT_SCALE.max;
  const low = clamp(min, SCALE_MIN_FLOOR, SCALE_MAX_CEILING);

  // Keep max strictly above min so the control always has at least two points.
  const scale: ScaleConfig = { min: low, max: clamp(max, low + 1, SCALE_MAX_CEILING) };
  if (typeof s.min_label === 'string' && s.min_label.trim()) scale.min_label = s.min_label.trim();
  if (typeof s.max_label === 'string' && s.max_label.trim()) scale.max_label = s.max_label.trim();
  return scale;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Every point on a scale question, min to max. */
export function scalePoints(scale: ScaleConfig): number[] {
  return Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i);
}

export type ValidatedAnswers = {
  ok: boolean;
  /** Trimmed answers for the questions that were answered. Only meaningful when ok. */
  answers: AnswerMap;
  /** Keyed by question id. Same wording as web. */
  errors: Record<string, string>;
};

/** Check answers against the meeting's questions: required ones answered, choices from the list. */
export function validateAnswers(schema: FormSchema, submitted: AnswerMap): ValidatedAnswers {
  const answers: AnswerMap = {};
  const errors: Record<string, string> = {};

  for (const q of schema) {
    const value = submitted[q.id];

    switch (q.type) {
      case 'short_text':
      case 'long_text': {
        const max = q.type === 'short_text' ? MAX_SHORT_TEXT_LENGTH : MAX_LONG_TEXT_LENGTH;
        const text = typeof value === 'string' ? value.trim() : '';
        if (!text) {
          if (q.required) errors[q.id] = 'This question is required.';
        } else if (text.length > max) {
          errors[q.id] = `Answer must be ${max} characters or fewer.`;
        } else {
          answers[q.id] = text;
        }
        break;
      }

      case 'multiple_choice':
      case 'dropdown': {
        const text = typeof value === 'string' ? value.trim() : '';
        if (!text) {
          if (q.required) errors[q.id] = 'Select an option.';
        } else if (!(q.options ?? []).includes(text)) {
          errors[q.id] = 'Select one of the listed options.';
        } else {
          answers[q.id] = text;
        }
        break;
      }

      case 'checkboxes': {
        const options = q.options ?? [];
        const selected = Array.isArray(value) ? value.map((v) => v.trim()).filter(Boolean) : [];
        if (selected.length === 0) {
          if (q.required) errors[q.id] = 'Select at least one option.';
        } else if (selected.some((s) => !options.includes(s))) {
          errors[q.id] = 'Select only from the listed options.';
        } else if (new Set(selected).size !== selected.length) {
          errors[q.id] = 'Duplicate selections.';
        } else {
          // Schema order, not tap order, so exports read the same for everyone.
          answers[q.id] = options.filter((o) => selected.includes(o));
        }
        break;
      }

      case 'scale': {
        const scale = q.scale ?? DEFAULT_SCALE;
        const num =
          typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
        if (!Number.isFinite(num)) {
          if (q.required) errors[q.id] = 'Pick a value.';
        } else if (!Number.isInteger(num) || num < scale.min || num > scale.max) {
          errors[q.id] = `Pick a value between ${scale.min} and ${scale.max}.`;
        } else {
          answers[q.id] = num;
        }
        break;
      }
    }
  }

  return { ok: Object.keys(errors).length === 0, answers, errors };
}

/** The parts of a meeting the request depends on. */
export type CheckInMeeting = {
  id: string;
  is_geo_locked: boolean;
  latitude: number | null;
  longitude: number | null;
  requires_checkin_password: boolean | null;
};

/**
 * True when check-in needs the phone's location: the meeting is geo-locked and
 * has a pin. A geo-locked meeting with no pin isn't enforced (on web or by the
 * server), so the app doesn't ask for location there either.
 */
export function needsLocation(meeting: CheckInMeeting): boolean {
  return meeting.is_geo_locked && meeting.latitude != null && meeting.longitude != null;
}

/**
 * The member-check-in body. Names the meeting explicitly so the server records
 * the one the member picked, and only carries a password or location when the
 * meeting asks for one. Identity is never in the body; the server reads it
 * from the Clerk token.
 */
export function buildCheckInRequest({
  orgSlug,
  meeting,
  password,
  answers,
  location,
}: {
  orgSlug: string;
  meeting: CheckInMeeting;
  password: string;
  answers: AnswerMap;
  location: { latitude: number; longitude: number } | null;
}): MemberCheckInRequest {
  return {
    orgSlug,
    meetingId: meeting.id,
    answers,
    ...(meeting.requires_checkin_password ? { password } : {}),
    ...(location ? { latitude: location.latitude, longitude: location.longitude } : {}),
  };
}

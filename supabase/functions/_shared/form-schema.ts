// Meeting check-in forms: types, parsing, validation and answer normalization.
//
// This module is the single source of truth for the form shape. It is imported
// by all three sides of the feature and must stay free of I/O and of React so
// that it can run in the browser (builder + check-in form) and on the server
// (submit-path validation) alike:
//
//   - the officer-facing builder     app/[orgSlug]/admin-dashboard/meetings/[meetingId]
//   - the attendee-facing form       app/[orgSlug]/checkin
//   - the server-side submit guard   app/[orgSlug]/checkin/guest-actions.ts
//
// The database stores form_schema as jsonb with only an "is an array" CHECK
// (see 20260815000000_add_meeting_form_schema.sql). Everything below the array
// level is validated here, so a question type can be added in TypeScript alone
// rather than requiring a migration.
//
// See the migration for the on-disk shape and the reasoning behind id-keyed
// answers.

export const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "multiple_choice",
  "checkboxes",
  "dropdown",
  "scale",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: "Short answer",
  long_text: "Paragraph",
  multiple_choice: "Multiple choice",
  checkboxes: "Checkboxes",
  dropdown: "Dropdown",
  scale: "Linear scale",
};

// The types whose answer must be one of a fixed option list.
export const CHOICE_TYPES: readonly QuestionType[] = [
  "multiple_choice",
  "checkboxes",
  "dropdown",
];

export function isChoiceType(type: QuestionType): boolean {
  return CHOICE_TYPES.includes(type);
}

export type ScaleConfig = {
  min: number;
  max: number;
  min_label?: string;
  max_label?: string;
};

export type FormQuestion = {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  /** Choice types only. Always present (possibly empty) for those types. */
  options?: string[];
  /** Scale type only. */
  scale?: ScaleConfig;
};

export type FormSchema = FormQuestion[];

/**
 * An answer as stored in attendance.answers, keyed by question id.
 *
 * `string[]` is the checkboxes shape (zero or more selected options); `number`
 * is the scale shape; `string` covers everything else.
 */
export type AnswerValue = string | string[] | number;
export type AnswerMap = Record<string, AnswerValue>;

// Field limits. Enforced identically on the builder and the submit path so an
// officer cannot author a form whose own answers would be rejected.
export const MAX_QUESTIONS = 50;
export const MAX_OPTIONS = 30;
export const MAX_LABEL_LENGTH = 300;
export const MAX_OPTION_LENGTH = 200;
export const MAX_SHORT_TEXT_LENGTH = 500;
export const MAX_LONG_TEXT_LENGTH = 5000;

// Scale bounds. `min` may be 0 or 1 (both conventional); `max` is capped at 10
// so the control stays a row of tappable buttons on a phone.
export const SCALE_MIN_FLOOR = 0;
export const SCALE_MAX_CEILING = 10;

export const DEFAULT_SCALE: ScaleConfig = { min: 1, max: 5 };

/**
 * Generate a stable question id.
 *
 * Ids are permanent: answers are keyed by them, so an id must never be reused
 * for a different question or rewritten when a question is edited or reordered.
 * Random rather than positional for exactly that reason.
 *
 * Uses crypto.randomUUID when available (all supported browsers and Node 19+),
 * falling back to Math.random -- ids only need to be unique within one form, so
 * the weaker source is acceptable and never security-relevant.
 */
export function newQuestionId(): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `q_${uuid.slice(0, 12)}`;
}

export function newQuestion(type: QuestionType = "short_text"): FormQuestion {
  return {
    id: newQuestionId(),
    type,
    label: "",
    required: false,
    ...(isChoiceType(type) ? { options: ["Option 1"] } : {}),
    ...(type === "scale" ? { scale: { ...DEFAULT_SCALE } } : {}),
  };
}

/**
 * Coerce a question to a different type, keeping what still applies.
 *
 * The id is preserved so answers already collected under it stay associated
 * with the question -- even though a type change can make those answers no
 * longer valid for the new type. That is the intended trade-off: the builder
 * blocks type changes once responses exist (see canEditStructurally).
 */
export function retypeQuestion(
  question: FormQuestion,
  type: QuestionType,
): FormQuestion {
  const next: FormQuestion = { ...question, type };

  if (isChoiceType(type)) {
    // Carry options across choice types; seed a first option when arriving from
    // a non-choice type so the editor is never showing an empty option list.
    next.options =
      question.options && question.options.length > 0
        ? [...question.options]
        : ["Option 1"];
  } else {
    delete next.options;
  }

  if (type === "scale") {
    next.scale = question.scale ? { ...question.scale } : { ...DEFAULT_SCALE };
  } else {
    delete next.scale;
  }

  return next;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse an untrusted jsonb value into a FormSchema, discarding anything
 * malformed.
 *
 * Lenient by design: this runs on READ, where the alternative to dropping a bad
 * question is throwing and taking down the whole check-in page. Writes go
 * through validateSchema() instead, which reports errors rather than silently
 * repairing. A question with no usable id or label is dropped; a question with a
 * salvageable body is repaired to its nearest valid form.
 */
export function parseSchema(raw: unknown): FormSchema {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const out: FormSchema = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const q = entry as Record<string, unknown>;

    const id = typeof q.id === "string" ? q.id.trim() : "";
    // A duplicate id would make two questions share one answer slot.
    if (!id || seen.has(id)) continue;

    const type = QUESTION_TYPES.includes(q.type as QuestionType)
      ? (q.type as QuestionType)
      : "short_text";

    const label = typeof q.label === "string" ? q.label : "";

    const question: FormQuestion = {
      id,
      type,
      label,
      required: q.required === true,
    };

    if (isChoiceType(type)) {
      question.options = Array.isArray(q.options)
        ? q.options
            .filter((o): o is string => typeof o === "string")
            .map((o) => o.trim())
            .filter(Boolean)
        : [];
    }

    if (type === "scale") {
      question.scale = parseScale(q.scale);
    }

    seen.add(id);
    out.push(question);
  }

  return out;
}

function parseScale(raw: unknown): ScaleConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SCALE };
  const s = raw as Record<string, unknown>;

  const min = Number.isFinite(s.min) ? Math.trunc(s.min as number) : DEFAULT_SCALE.min;
  const max = Number.isFinite(s.max) ? Math.trunc(s.max as number) : DEFAULT_SCALE.max;

  const scale: ScaleConfig = {
    min: clamp(min, SCALE_MIN_FLOOR, SCALE_MAX_CEILING),
    // Keep max strictly above min so the rendered control always has >= 2 points.
    max: clamp(max, clamp(min, SCALE_MIN_FLOOR, SCALE_MAX_CEILING) + 1, SCALE_MAX_CEILING),
  };
  if (typeof s.min_label === "string" && s.min_label.trim()) {
    scale.min_label = s.min_label.trim();
  }
  if (typeof s.max_label === "string" && s.max_label.trim()) {
    scale.max_label = s.max_label.trim();
  }
  return scale;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Parse an untrusted attendance.answers value into an id-keyed map. */
export function parseAnswers(raw: unknown): AnswerMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: AnswerMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.filter((v): v is string => typeof v === "string");
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Schema validation (the builder's Save path)
// ---------------------------------------------------------------------------

export type SchemaError = {
  /** Question id, or null for a whole-form error. */
  questionId: string | null;
  message: string;
};

/**
 * Validate a schema an officer is trying to save.
 *
 * Strict, and reports every problem at once rather than stopping at the first,
 * so the builder can mark each offending card in a single pass.
 */
export function validateSchema(schema: FormSchema): SchemaError[] {
  const errors: SchemaError[] = [];

  if (schema.length > MAX_QUESTIONS) {
    errors.push({
      questionId: null,
      message: `A form can have at most ${MAX_QUESTIONS} questions.`,
    });
  }

  const seen = new Set<string>();

  for (const q of schema) {
    if (!q.id) {
      errors.push({ questionId: null, message: "A question is missing its id." });
      continue;
    }
    if (seen.has(q.id)) {
      errors.push({
        questionId: q.id,
        message: "Duplicate question id — this would corrupt saved answers.",
      });
      continue;
    }
    seen.add(q.id);

    const label = q.label.trim();
    if (!label) {
      errors.push({ questionId: q.id, message: "Question text is required." });
    } else if (label.length > MAX_LABEL_LENGTH) {
      errors.push({
        questionId: q.id,
        message: `Question text must be ${MAX_LABEL_LENGTH} characters or fewer.`,
      });
    }

    if (isChoiceType(q.type)) {
      const options = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (options.length === 0) {
        errors.push({ questionId: q.id, message: "Add at least one option." });
      }
      if (options.length > MAX_OPTIONS) {
        errors.push({
          questionId: q.id,
          message: `A question can have at most ${MAX_OPTIONS} options.`,
        });
      }
      if (options.some((o) => o.length > MAX_OPTION_LENGTH)) {
        errors.push({
          questionId: q.id,
          message: `Options must be ${MAX_OPTION_LENGTH} characters or fewer.`,
        });
      }
      // Duplicate options are ambiguous in a stored answer -- "Friend" selected
      // twice cannot be told apart on read.
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
        errors.push({ questionId: q.id, message: "Options must be unique." });
      }
    }

    if (q.type === "scale") {
      const scale = q.scale ?? DEFAULT_SCALE;
      if (!Number.isInteger(scale.min) || !Number.isInteger(scale.max)) {
        errors.push({ questionId: q.id, message: "Scale bounds must be whole numbers." });
      } else if (scale.min >= scale.max) {
        errors.push({
          questionId: q.id,
          message: "Scale maximum must be greater than the minimum.",
        });
      } else if (scale.min < SCALE_MIN_FLOOR || scale.max > SCALE_MAX_CEILING) {
        errors.push({
          questionId: q.id,
          message: `Scale must fall between ${SCALE_MIN_FLOOR} and ${SCALE_MAX_CEILING}.`,
        });
      }
    }
  }

  return errors;
}

/**
 * Strip a schema to exactly what belongs in the database.
 *
 * Trims text, drops empty options, and removes the keys that do not apply to a
 * question's type -- so a question that was briefly a dropdown does not carry a
 * stale `options` array once it is a short_text again.
 */
export function normalizeSchema(schema: FormSchema): FormSchema {
  return schema.map((q) => {
    const out: FormQuestion = {
      id: q.id,
      type: q.type,
      label: q.label.trim(),
      required: q.required === true,
    };
    if (isChoiceType(q.type)) {
      out.options = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
    }
    if (q.type === "scale") {
      const scale = q.scale ?? DEFAULT_SCALE;
      out.scale = {
        min: scale.min,
        max: scale.max,
        ...(scale.min_label?.trim() ? { min_label: scale.min_label.trim() } : {}),
        ...(scale.max_label?.trim() ? { max_label: scale.max_label.trim() } : {}),
      };
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// Answer validation (the check-in submit path)
// ---------------------------------------------------------------------------

export type AnswerErrors = Record<string, string>;

export type ValidatedAnswers = {
  ok: boolean;
  /** Cleaned answers, safe to persist. Only meaningful when ok is true. */
  answers: AnswerMap;
  /** Keyed by question id. */
  errors: AnswerErrors;
};

/**
 * Validate and clean a set of submitted answers against a schema.
 *
 * MUST be called server-side before persisting. The check-in form calls it too,
 * for inline errors, but the browser copy is advisory only -- the guest path is
 * a public endpoint and the member path writes through PostgREST, so neither
 * client can be trusted to have run it.
 *
 * Answers for ids not in the schema are DROPPED rather than rejected: a question
 * deleted between page load and submit should not fail an otherwise valid
 * check-in, and echoing unknown keys back into storage would let a caller write
 * arbitrary jsonb into the row.
 */
export function validateAnswers(
  schema: FormSchema,
  raw: unknown,
): ValidatedAnswers {
  const submitted = parseAnswers(raw);
  const answers: AnswerMap = {};
  const errors: AnswerErrors = {};

  for (const q of schema) {
    const value = submitted[q.id];

    switch (q.type) {
      case "short_text":
      case "long_text": {
        const max =
          q.type === "short_text" ? MAX_SHORT_TEXT_LENGTH : MAX_LONG_TEXT_LENGTH;
        const text = typeof value === "string" ? value.trim() : "";
        if (!text) {
          if (q.required) errors[q.id] = "This question is required.";
          break;
        }
        if (text.length > max) {
          errors[q.id] = `Answer must be ${max} characters or fewer.`;
          break;
        }
        answers[q.id] = text;
        break;
      }

      case "multiple_choice":
      case "dropdown": {
        const options = q.options ?? [];
        const text = typeof value === "string" ? value.trim() : "";
        if (!text) {
          if (q.required) errors[q.id] = "Select an option.";
          break;
        }
        if (!options.includes(text)) {
          errors[q.id] = "Select one of the listed options.";
          break;
        }
        answers[q.id] = text;
        break;
      }

      case "checkboxes": {
        const options = q.options ?? [];
        const selected = Array.isArray(value)
          ? value.map((v) => v.trim()).filter(Boolean)
          : [];
        if (selected.length === 0) {
          if (q.required) errors[q.id] = "Select at least one option.";
          break;
        }
        if (selected.some((s) => !options.includes(s))) {
          errors[q.id] = "Select only from the listed options.";
          break;
        }
        if (new Set(selected).size !== selected.length) {
          errors[q.id] = "Duplicate selections.";
          break;
        }
        // Store in schema order rather than click order so exports and summaries
        // are stable across respondents.
        answers[q.id] = options.filter((o) => selected.includes(o));
        break;
      }

      case "scale": {
        const scale = q.scale ?? DEFAULT_SCALE;
        // A scale answer may arrive as a number or as the string form of one
        // (an <input> value is always a string).
        const num =
          typeof value === "number"
            ? value
            : typeof value === "string" && value.trim() !== ""
              ? Number(value)
              : NaN;
        if (!Number.isFinite(num)) {
          if (q.required) errors[q.id] = "Pick a value.";
          break;
        }
        if (!Number.isInteger(num) || num < scale.min || num > scale.max) {
          errors[q.id] = `Pick a value between ${scale.min} and ${scale.max}.`;
          break;
        }
        answers[q.id] = num;
        break;
      }
    }
  }

  return { ok: Object.keys(errors).length === 0, answers, errors };
}

/** True when the meeting collects anything at check-in. */
export function hasQuestions(schema: FormSchema): boolean {
  return schema.length > 0;
}

/**
 * Whether a form may still be edited structurally.
 *
 * Once responses exist, deleting a question or removing a choice option orphans
 * data that is already stored -- there is no way to render an answer whose
 * question is gone. Labels stay editable (fixing a typo is legitimate and does
 * not break the id-keyed link) and new questions may still be added; earlier
 * respondents simply have no answer for them.
 */
export function canEditStructurally(responseCount: number): boolean {
  return responseCount === 0;
}

/** Render a stored answer as a single display/CSV string. */
export function formatAnswer(value: AnswerValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join("; ");
  return String(value);
}

"use client";

import {
  DEFAULT_SCALE,
  type AnswerMap,
  type AnswerValue,
  type FormSchema,
} from "@/lib/form-schema";

/**
 * The attendee-facing check-in form.
 *
 * Styled for the check-in page's translucent-on-brand-background treatment
 * rather than the admin dashboard's white cards. Controls use py-3 and a >=44px
 * hit area for the same reason the rest of that page does: this is used on a
 * phone, standing in a doorway.
 *
 * Errors are passed in from the parent, which gets them from validateAnswers --
 * the same function the server re-runs before persisting.
 */
export function FormRenderer({
  schema,
  answers,
  errors,
  disabled,
  onChange,
}: {
  schema: FormSchema;
  answers: AnswerMap;
  errors: Record<string, string>;
  disabled?: boolean;
  onChange: (questionId: string, value: AnswerValue) => void;
}) {
  if (schema.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {schema.map((question) => {
        const value = answers[question.id];
        const error = errors[question.id];
        const options = question.options ?? [];
        const scale = question.scale ?? DEFAULT_SCALE;
        const labelId = `q-label-${question.id}`;

        return (
          <fieldset key={question.id} className="border-0 p-0">
            <legend id={labelId} className="mb-2 text-sm font-medium text-white">
              {question.label}
              {question.required && (
                <span className="ml-1 text-red-300" aria-hidden="true">
                  *
                </span>
              )}
            </legend>

            {(question.type === "short_text" || question.type === "long_text") &&
              (question.type === "short_text" ? (
                <input
                  type="text"
                  value={typeof value === "string" ? value : ""}
                  disabled={disabled}
                  required={question.required}
                  aria-labelledby={labelId}
                  aria-invalid={Boolean(error)}
                  onChange={(e) => onChange(question.id, e.target.value)}
                  className={inputClass(error)}
                />
              ) : (
                <textarea
                  rows={3}
                  value={typeof value === "string" ? value : ""}
                  disabled={disabled}
                  required={question.required}
                  aria-labelledby={labelId}
                  aria-invalid={Boolean(error)}
                  onChange={(e) => onChange(question.id, e.target.value)}
                  className={`${inputClass(error)} resize-y`}
                />
              ))}

            {question.type === "multiple_choice" && (
              <div className="flex flex-col gap-2">
                {options.map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm text-white transition-colors hover:bg-white/15"
                  >
                    <input
                      type="radio"
                      name={question.id}
                      value={option}
                      checked={value === option}
                      disabled={disabled}
                      onChange={() => onChange(question.id, option)}
                      className="flex-none"
                    />
                    <span className="min-w-0 wrap-break-word">{option}</span>
                  </label>
                ))}
              </div>
            )}

            {question.type === "checkboxes" && (
              <div className="flex flex-col gap-2">
                {options.map((option) => {
                  const selected = Array.isArray(value) ? value : [];
                  const checked = selected.includes(option);
                  return (
                    <label
                      key={option}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm text-white transition-colors hover:bg-white/15"
                    >
                      <input
                        type="checkbox"
                        value={option}
                        checked={checked}
                        disabled={disabled}
                        onChange={() =>
                          onChange(
                            question.id,
                            checked
                              ? selected.filter((s) => s !== option)
                              : [...selected, option],
                          )
                        }
                        className="flex-none"
                      />
                      <span className="min-w-0 wrap-break-word">{option}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {question.type === "dropdown" && (
              <select
                value={typeof value === "string" ? value : ""}
                disabled={disabled}
                required={question.required}
                aria-labelledby={labelId}
                aria-invalid={Boolean(error)}
                onChange={(e) => onChange(question.id, e.target.value)}
                className={`${inputClass(error)} cursor-pointer`}
              >
                <option value="" className="text-slate-900">
                  Choose…
                </option>
                {options.map((option) => (
                  <option key={option} value={option} className="text-slate-900">
                    {option}
                  </option>
                ))}
              </select>
            )}

            {question.type === "scale" && (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {scalePoints(scale.min, scale.max).map((point) => (
                    <button
                      key={point}
                      type="button"
                      disabled={disabled}
                      aria-pressed={value === point}
                      onClick={() => onChange(question.id, point)}
                      className={`h-11 min-w-11 rounded-lg border px-3 text-sm font-bold transition-colors ${
                        value === point
                          ? "border-white/60 bg-white/30 text-white"
                          : "border-white/20 bg-white/10 text-white/70 hover:bg-white/15"
                      }`}
                    >
                      {point}
                    </button>
                  ))}
                </div>
                {(scale.min_label || scale.max_label) && (
                  <div className="mt-1.5 flex justify-between text-xs text-white/50">
                    <span>{scale.min_label ?? ""}</span>
                    <span>{scale.max_label ?? ""}</span>
                  </div>
                )}
              </div>
            )}

            {error && <p className="mt-1.5 text-xs text-red-300">{error}</p>}
          </fieldset>
        );
      })}
    </div>
  );
}

function inputClass(error?: string): string {
  return `w-full rounded-lg border bg-white/10 px-4 py-3 text-white placeholder-white/40 focus:outline-none ${
    error ? "border-red-400/70" : "border-white/20 focus:border-white/50"
  }`;
}

function scalePoints(min: number, max: number): number[] {
  const points: number[] = [];
  for (let i = min; i <= max; i++) points.push(i);
  return points;
}

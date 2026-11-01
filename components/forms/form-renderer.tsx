"use client";

import {
  DEFAULT_SCALE,
  type AnswerMap,
  type AnswerValue,
  type FormSchema,
} from "@/lib/form-schema";
import { parseRichText } from "@/lib/rich-text";
import { cn } from "@/lib/utils";
import { FIELD_CLASS, Label } from "@/components/ui/primitives";

/**
 * The attendee-facing check-in form.
 *
 * Choice options are whole selectable cards rather than a native control with a
 * label beside it: this is used on a phone, standing in a doorway, so the tap
 * target is the entire row and the selected state is carried by the card's own
 * border and tint, not by a 13px dot. The native input stays in the DOM (visually
 * hidden via `peer` + `sr-only`) so keyboard and screen-reader semantics are the
 * real ones.
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
    <div className="flex flex-col gap-5">
      {schema.map((question) => {
        const value = answers[question.id];
        const error = errors[question.id];
        const options = question.options ?? [];
        const scale = question.scale ?? DEFAULT_SCALE;
        const labelId = `q-label-${question.id}`;

        return (
          <fieldset key={question.id} className="flex flex-col gap-2 border-0 p-0">
            <legend id={labelId} className="mb-1">
              {/* whitespace-pre-line is what makes newlines in the label
                  actually break -- HTML collapses them otherwise, so a
                  multi-line question would render as one run-on line. */}
              <Label className="block whitespace-pre-line">
                <RichText text={question.label} />
                {question.required && (
                  <span className="ml-1 text-bad" aria-hidden="true">
                    *
                  </span>
                )}
              </Label>
            </legend>

            {question.type === "short_text" && (
              <input
                type="text"
                value={typeof value === "string" ? value : ""}
                disabled={disabled}
                required={question.required}
                aria-labelledby={labelId}
                aria-invalid={Boolean(error)}
                placeholder="Short answer"
                onChange={(e) => onChange(question.id, e.target.value)}
                className={cn(FIELD_CLASS, error && "border-bad")}
              />
            )}

            {question.type === "long_text" && (
              <textarea
                rows={3}
                value={typeof value === "string" ? value : ""}
                disabled={disabled}
                required={question.required}
                aria-labelledby={labelId}
                aria-invalid={Boolean(error)}
                placeholder="Your answer"
                onChange={(e) => onChange(question.id, e.target.value)}
                className={cn(FIELD_CLASS, "resize-y", error && "border-bad")}
              />
            )}

            {question.type === "multiple_choice" && (
              <div className="flex flex-col gap-2">
                {options.map((option) => (
                  <OptionCard
                    key={option}
                    type="radio"
                    name={question.id}
                    label={option}
                    checked={value === option}
                    disabled={disabled}
                    onSelect={() => onChange(question.id, option)}
                  />
                ))}
              </div>
            )}

            {question.type === "checkboxes" && (
              <div className="flex flex-col gap-2">
                {options.map((option) => {
                  const selected = Array.isArray(value) ? value : [];
                  const checked = selected.includes(option);
                  return (
                    <OptionCard
                      key={option}
                      type="checkbox"
                      name={question.id}
                      label={option}
                      checked={checked}
                      disabled={disabled}
                      onSelect={() =>
                        onChange(
                          question.id,
                          checked
                            ? selected.filter((s) => s !== option)
                            : [...selected, option],
                        )
                      }
                    />
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
                className={cn(FIELD_CLASS, "cursor-pointer", error && "border-bad")}
              >
                <option value="">Choose…</option>
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}

            {question.type === "scale" && (
              <div className="flex flex-col gap-1.5">
                {/* Equal-width points across the full row -- a 1-5 scale reads
                    as a scale only when the steps are evenly weighted. */}
                <div className="flex gap-1.5">
                  {scalePoints(scale.min, scale.max).map((point) => (
                    <button
                      key={point}
                      type="button"
                      disabled={disabled}
                      aria-pressed={value === point}
                      onClick={() => onChange(question.id, point)}
                      className={cn(
                        "min-h-11 flex-1 cursor-pointer rounded-control border text-sm font-medium transition-colors",
                        value === point
                          ? "border-accent bg-accent text-accent-ink"
                          : "border-line bg-surface text-ink-muted hover:bg-surface-sunken",
                      )}
                    >
                      {point}
                    </button>
                  ))}
                </div>
                {(scale.min_label || scale.max_label) && (
                  <div className="flex justify-between text-xs text-ink-faint">
                    <span>{scale.min_label ?? ""}</span>
                    <span>{scale.max_label ?? ""}</span>
                  </div>
                )}
              </div>
            )}

            {error && <p className="m-0 text-xs text-bad">{error}</p>}
          </fieldset>
        );
      })}
    </div>
  );
}

/**
 * Question text with its URLs turned into real links.
 *
 * Segments come from parseRichText, which only ever emits plain strings and
 * http(s) hrefs -- nothing here is interpreted as markup, so a label containing
 * HTML is displayed rather than rendered. See lib/rich-text.ts.
 *
 * The link stops click and pointer events from reaching the surrounding
 * <legend>/<label>: on the check-in page a label click activates its control,
 * which would otherwise fire the moment someone taps the Instagram link.
 * `rel="noreferrer"` because these point off-site and the target is arbitrary.
 */
function RichText({ text }: { text: string }) {
  return (
    <>
      {parseRichText(text).map((segment, i) =>
        segment.type === "link" ? (
          <a
            key={i}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-semibold text-accent underline underline-offset-2 wrap-anywhere hover:text-accent-deep"
          >
            {segment.value}
          </a>
        ) : (
          <span key={i}>{segment.value}</span>
        ),
      )}
    </>
  );
}

/**
 * One selectable option rendered as a full-width card.
 *
 * The real input is kept and only visually hidden, so the control stays
 * focusable and announces correctly; `peer-focus-visible` puts the focus ring on
 * the card the user can actually see.
 */
function OptionCard({
  type,
  name,
  label,
  checked,
  disabled,
  onSelect,
}: {
  type: "radio" | "checkbox";
  name: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-control border px-4 py-3.5 transition-colors",
        "peer-focus-visible:border-accent",
        checked
          ? "border-accent bg-accent-soft"
          : "border-line bg-surface hover:bg-surface-sunken",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type={type}
        name={name}
        value={label}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="peer sr-only"
      />
      {/* The indicator. A radio fills as a ring, a checkbox as a tick -- the
          shape difference is what tells someone whether they may pick more
          than one. */}
      <span
        aria-hidden="true"
        className={cn(
          "flex size-4.5 flex-none items-center justify-center border-[1.5px] transition-colors",
          type === "radio" ? "rounded-full" : "rounded-sm",
          checked ? "border-accent bg-accent" : "border-ink-faint bg-surface",
        )}
      >
        {checked &&
          (type === "radio" ? (
            <span className="size-1.5 rounded-full bg-accent-ink" />
          ) : (
            <svg
              viewBox="0 0 12 12"
              className="size-3 text-accent-ink"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2.5 6.5l2.5 2.5 4.5-5" />
            </svg>
          ))}
      </span>
      <span
        className={cn(
          "min-w-0 text-[15px] wrap-break-word",
          checked ? "font-semibold text-accent-on-soft" : "text-ink-strong",
        )}
      >
        {label}
      </span>
    </label>
  );
}

function scalePoints(min: number, max: number): number[] {
  const points: number[] = [];
  for (let i = min; i <= max; i++) points.push(i);
  return points;
}

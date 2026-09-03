"use client";

import { ChevronDown, ChevronUp, Copy, GripVertical, Trash2, X } from "lucide-react";

import {
  CHOICE_TYPES,
  DEFAULT_SCALE,
  MAX_OPTIONS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  SCALE_MAX_CEILING,
  SCALE_MIN_FLOOR,
  isChoiceType,
  retypeQuestion,
  type FormQuestion,
  type QuestionType,
} from "@/lib/form-schema";

/**
 * One question in the builder.
 *
 * Collapsed it shows the prompt and its type; expanded it becomes the editor.
 * Only one card is expanded at a time (the parent owns that state), which is
 * what keeps a 20-question form navigable -- the same reason Google Forms does
 * it.
 *
 * `locked` is set once the meeting has responses. It disables the edits that
 * would orphan stored answers (delete the question, change its type, remove an
 * option) while leaving label and required editable. See canEditStructurally.
 */
export function QuestionCard({
  question,
  index,
  total,
  expanded,
  locked,
  error,
  onChange,
  onExpand,
  onDelete,
  onDuplicate,
  onMove,
}: {
  question: FormQuestion;
  index: number;
  total: number;
  expanded: boolean;
  locked: boolean;
  error?: string;
  onChange: (next: FormQuestion) => void;
  onExpand: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const set = (patch: Partial<FormQuestion>) =>
    onChange({ ...question, ...patch });

  const setOption = (optionIndex: number, value: string) => {
    const options = [...(question.options ?? [])];
    options[optionIndex] = value;
    set({ options });
  };

  const addOption = () => {
    const options = [...(question.options ?? [])];
    if (options.length >= MAX_OPTIONS) return;
    options.push(`Option ${options.length + 1}`);
    set({ options });
  };

  const removeOption = (optionIndex: number) => {
    const options = (question.options ?? []).filter((_, i) => i !== optionIndex);
    set({ options });
  };

  const scale = question.scale ?? DEFAULT_SCALE;

  return (
    <div
      className={`rounded-card border bg-white transition-all ${
        error
          ? "border-bad-line"
          : expanded
            ? "border-accent"
            : "border-line"
      }`}
    >
      {/* Collapsed header. Clicking anywhere on it expands the card; the action
          buttons stopPropagation so they don't toggle it shut again. */}
      <div
        onClick={onExpand}
        className="flex cursor-pointer items-start gap-3 px-4 py-3.5"
      >
        <GripVertical
          className="mt-0.5 h-4 w-4 flex-none text-ink-faint"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-ink-faint">{index + 1}.</span>
            <span
              className={`truncate text-sm font-bold ${
                question.label.trim() ? "text-ink" : "text-ink-faint italic"
              }`}
            >
              {question.label.trim() || "Untitled question"}
            </span>
            {question.required && (
              <span className="flex-none text-sm font-bold text-bad" title="Required">
                *
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs font-semibold text-ink-muted">
            {QUESTION_TYPE_LABELS[question.type]}
            {isChoiceType(question.type) &&
              ` · ${(question.options ?? []).length} option${
                (question.options ?? []).length === 1 ? "" : "s"
              }`}
          </div>
          {error && (
            <div className="mt-1.5 text-xs font-semibold text-bad">{error}</div>
          )}
        </div>

        <div className="flex flex-none items-center gap-0.5">
          <button
            type="button"
            aria-label="Move up"
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation();
              onMove(-1);
            }}
            className="cursor-pointer rounded-md p-1.5 text-ink-faint hover:bg-surface-sunken hover:text-ink-strong disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Move down"
            disabled={index === total - 1}
            onClick={(e) => {
              e.stopPropagation();
              onMove(1);
            }}
            className="cursor-pointer rounded-md p-1.5 text-ink-faint hover:bg-surface-sunken hover:text-ink-strong disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3.5 border-t border-line-soft px-4 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-ink-muted">
              Question
            </label>
            {/* A textarea, not an <input type="text">: an input cannot hold a
                newline at all, so multi-line prompts ("Follow our socials!"
                above a list of links) were impossible to type regardless of how
                they rendered. Auto-grows with the text so the common one-line
                question still looks like a single-line field. */}
            <textarea
              value={question.label}
              rows={Math.min(8, Math.max(1, question.label.split("\n").length))}
              onChange={(e) => set({ label: e.target.value })}
              placeholder="e.g. How did you hear about this meeting?"
              className="w-full resize-y rounded-lg border border-line px-3 py-2.5 text-sm"
            />
            <p className="mt-1 text-[11px] text-ink-muted">
              Press Enter for a new line. Links starting with{" "}
              <span className="font-semibold">https://</span> become tappable on
              the check-in page.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-ink-muted">
              Answer type
            </label>
            <select
              value={question.type}
              disabled={locked}
              onChange={(e) =>
                onChange(retypeQuestion(question, e.target.value as QuestionType))
              }
              className="w-full cursor-pointer rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-faint"
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {locked && (
              <p className="mt-1 text-[11px] text-ink-muted">
                Type is locked — this meeting already has responses.
              </p>
            )}
          </div>

          {CHOICE_TYPES.includes(question.type) && (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-ink-muted">
                Options
              </label>
              <div className="flex flex-col gap-2">
                {(question.options ?? []).map((option, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex-none text-xs text-ink-faint">
                      {question.type === "checkboxes" ? "☐" : "○"}
                    </span>
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => setOption(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                      className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      aria-label={`Remove option ${i + 1}`}
                      disabled={locked || (question.options ?? []).length <= 1}
                      onClick={() => removeOption(i)}
                      className="flex-none cursor-pointer rounded-md p-1.5 text-ink-faint hover:bg-bad-surface hover:text-bad disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addOption}
                disabled={(question.options ?? []).length >= MAX_OPTIONS}
                className="mt-2 cursor-pointer text-xs font-bold text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                + Add option
              </button>
              {locked && (
                <p className="mt-1 text-[11px] text-ink-muted">
                  Existing options can&apos;t be removed — answers already
                  reference them.
                </p>
              )}
            </div>
          )}

          {question.type === "scale" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-ink-muted">
                  From
                </label>
                <input
                  type="number"
                  min={SCALE_MIN_FLOOR}
                  max={SCALE_MAX_CEILING - 1}
                  value={scale.min}
                  onChange={(e) =>
                    set({ scale: { ...scale, min: Number(e.target.value) } })
                  }
                  className="w-full rounded-lg border border-line px-2.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-ink-muted">
                  To
                </label>
                <input
                  type="number"
                  min={SCALE_MIN_FLOOR + 1}
                  max={SCALE_MAX_CEILING}
                  value={scale.max}
                  onChange={(e) =>
                    set({ scale: { ...scale, max: Number(e.target.value) } })
                  }
                  className="w-full rounded-lg border border-line px-2.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-ink-muted">
                  Label for {scale.min} <span className="font-medium">(optional)</span>
                </label>
                <input
                  type="text"
                  value={scale.min_label ?? ""}
                  onChange={(e) => set({ scale: { ...scale, min_label: e.target.value } })}
                  placeholder="Not at all"
                  className="w-full rounded-lg border border-line px-2.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-ink-muted">
                  Label for {scale.max} <span className="font-medium">(optional)</span>
                </label>
                <input
                  type="text"
                  value={scale.max_label ?? ""}
                  onChange={(e) => set({ scale: { ...scale, max_label: e.target.value } })}
                  placeholder="Very much"
                  className="w-full rounded-lg border border-line px-2.5 py-2 text-sm"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-line-soft pt-3.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink-strong">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(e) => set({ required: e.target.checked })}
              />
              Required
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onDuplicate}
                title="Duplicate question"
                aria-label="Duplicate question"
                className="cursor-pointer rounded-md p-2 text-ink-faint hover:bg-surface-sunken hover:text-ink-strong"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={locked}
                title={
                  locked
                    ? "Can't delete — this meeting already has responses"
                    : "Delete question"
                }
                aria-label="Delete question"
                className="cursor-pointer rounded-md p-2 text-ink-faint hover:bg-bad-surface hover:text-bad disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

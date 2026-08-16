"use client";

import { useState } from "react";

import { QuestionCard } from "./question-card";
import {
  MAX_QUESTIONS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  newQuestion,
  newQuestionId,
  type FormQuestion,
  type FormSchema,
  type QuestionType,
  type SchemaError,
} from "@/lib/form-schema";

/**
 * The check-in form builder: a vertical stack of question cards with one
 * expanded at a time.
 *
 * Reordering is up/down buttons rather than drag-and-drop. The project has no
 * drag library and a hand-rolled HTML5 drag implementation is a large amount of
 * fiddly code that is inaccessible by default; buttons are keyboard-operable
 * for free and cover the same need for the handful of questions these forms
 * actually carry.
 *
 * This component is CONTROLLED and holds no draft of its own -- the parent owns
 * the schema so it can track dirty state against what was last saved and drive
 * the explicit Save button.
 */
export function FormBuilder({
  schema,
  locked,
  errors,
  onChange,
}: {
  schema: FormSchema;
  /** Meeting already has responses: structural edits are disabled. */
  locked: boolean;
  errors: SchemaError[];
  onChange: (next: FormSchema) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(
    schema.length > 0 ? schema[0].id : null,
  );
  const [addType, setAddType] = useState<QuestionType>("short_text");

  const errorFor = (id: string) =>
    errors.find((e) => e.questionId === id)?.message;

  const replaceAt = (index: number, question: FormQuestion) => {
    const next = [...schema];
    next[index] = question;
    onChange(next);
  };

  const addQuestion = () => {
    if (schema.length >= MAX_QUESTIONS) return;
    const question = newQuestion(addType);
    onChange([...schema, question]);
    // Expand the new card: it has an empty label and is useless collapsed.
    setExpandedId(question.id);
  };

  const duplicateQuestion = (index: number) => {
    if (schema.length >= MAX_QUESTIONS) return;
    // A fresh id, always. Copying the id would make both cards write to the same
    // answer slot.
    const copy: FormQuestion = {
      ...schema[index],
      id: newQuestionId(),
      options: schema[index].options ? [...schema[index].options!] : undefined,
      scale: schema[index].scale ? { ...schema[index].scale! } : undefined,
    };
    const next = [...schema];
    next.splice(index + 1, 0, copy);
    onChange(next);
    setExpandedId(copy.id);
  };

  const deleteQuestion = (index: number) => {
    const next = schema.filter((_, i) => i !== index);
    onChange(next);
    if (expandedId === schema[index].id) setExpandedId(null);
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= schema.length) return;
    const next = [...schema];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const formError = errors.find((e) => e.questionId === null)?.message;

  return (
    <div className="flex flex-col gap-3">
      {formError && (
        <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {formError}
        </div>
      )}

      {locked && (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-bold">This meeting has responses.</span> You can
          still fix wording and add questions, but deleting a question or an
          option would orphan answers that are already saved.
        </div>
      )}

      {schema.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-600">
            No questions yet.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Attendees will just tap “Check In”. Add a question to collect
            something at the door.
          </p>
        </div>
      ) : (
        schema.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            index={index}
            total={schema.length}
            expanded={expandedId === question.id}
            locked={locked}
            error={errorFor(question.id)}
            onChange={(next) => replaceAt(index, next)}
            onExpand={() =>
              setExpandedId(expandedId === question.id ? null : question.id)
            }
            onDelete={() => deleteQuestion(index)}
            onDuplicate={() => duplicateQuestion(index)}
            onMove={(direction) => moveQuestion(index, direction)}
          />
        ))
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={addType}
          onChange={(e) => setAddType(e.target.value as QuestionType)}
          aria-label="Type of question to add"
          className="cursor-pointer rounded-[9px] border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold"
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {QUESTION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addQuestion}
          disabled={schema.length >= MAX_QUESTIONS}
          className="cursor-pointer rounded-[9px] border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-brand-background transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add question
        </button>
        {schema.length >= MAX_QUESTIONS && (
          <span className="text-xs font-semibold text-slate-500">
            Limit of {MAX_QUESTIONS} questions reached.
          </span>
        )}
      </div>
    </div>
  );
}

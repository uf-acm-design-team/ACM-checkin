"use client";

import { useMemo, useState } from "react";

import {
  formatAnswer,
  isChoiceType,
  type FormSchema,
} from "@/lib/form-schema";
import type { AttendanceRow } from "@/lib/attendance-csv";

/**
 * The Responses tab: a per-question summary plus the raw attendee table.
 *
 * Summary mode aggregates in the browser rather than in SQL. A meeting's
 * attendance is bounded by the size of a student org's turnout (tens to low
 * hundreds), and the rows are already fetched for the CSV export -- a
 * round-trip per question would cost more than counting them here.
 */
export function ResponsesPanel({
  schema,
  rows,
  loading,
  schemaDirty,
  onExport,
}: {
  schema: FormSchema;
  rows: AttendanceRow[] | null;
  loading: boolean;
  /** Unsaved question edits: the summary below reflects the draft, not the DB. */
  schemaDirty: boolean;
  onExport: () => void;
}) {
  const [mode, setMode] = useState<"summary" | "individual">("summary");

  const summaries = useMemo(() => {
    if (!rows) return [];
    return schema.map((question) => {
      const answered = rows
        .map((row) => row.answers[question.id])
        .filter((v) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0));

      // Choice and scale answers tally; free text is listed verbatim, since
      // counting distinct sentences tells an officer nothing.
      const tally = new Map<string, number>();
      if (isChoiceType(question.type) || question.type === "scale") {
        for (const value of answered) {
          // A checkboxes answer contributes once per selected option.
          const parts = Array.isArray(value) ? value : [String(value)];
          for (const part of parts) {
            tally.set(part, (tally.get(part) ?? 0) + 1);
          }
        }
      }

      return {
        question,
        answeredCount: answered.length,
        tally: [...tally.entries()].sort((a, b) => b[1] - a[1]),
        texts: answered.map((v) => formatAnswer(v)),
      };
    });
  }, [rows, schema]);

  if (loading && !rows) {
    return (
      <div className="rounded-[14px] border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        Loading responses...
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-[14px] border border-slate-200 bg-white p-10 text-center">
        <p className="text-sm font-semibold text-slate-600">No check-ins yet.</p>
        <p className="mt-1 text-xs text-slate-500">
          Responses appear here as attendees check in.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 rounded-[10px] bg-slate-100 p-1">
          {(["summary", "individual"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 cursor-pointer rounded-lg px-4 py-2 text-[13px] font-bold capitalize transition-all sm:flex-none ${
                mode === m
                  ? "bg-white text-brand-background shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <button
          onClick={onExport}
          className="cursor-pointer rounded-[9px] bg-brand-background px-4 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90"
        >
          ↓ Download CSV
        </button>
      </div>

      {schemaDirty && (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You have unsaved question changes. This summary and the CSV use your
          draft, so a question you just added shows no answers until people
          respond to the saved form.
        </div>
      )}

      {mode === "summary" ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-[14px] border border-slate-200 bg-white p-5">
            <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Total check-ins
            </div>
            <div className="mt-1 text-3xl font-extrabold">{rows.length}</div>
          </div>

          {schema.length === 0 ? (
            <div className="rounded-[14px] border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              This meeting has no questions — attendance only.
            </div>
          ) : (
            summaries.map(({ question, answeredCount, tally, texts }) => (
              <div
                key={question.id}
                className="rounded-[14px] border border-slate-200 bg-white p-5"
              >
                <div className="mb-1 text-sm font-bold wrap-break-word">
                  {question.label || "Untitled question"}
                </div>
                <div className="mb-3.5 text-xs font-semibold text-slate-500">
                  {answeredCount} of {rows.length} answered
                </div>

                {tally.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {tally.map(([option, count]) => {
                      // Percentage of respondents, not of selections: with
                      // checkboxes the selections can exceed the head count, and
                      // "60% of people picked this" is the useful reading.
                      const pct = answeredCount
                        ? Math.round((count / answeredCount) * 100)
                        : 0;
                      return (
                        <div key={option} className="flex items-center gap-3">
                          <div className="w-32 flex-none truncate text-xs font-semibold text-slate-600">
                            {option}
                          </div>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-brand-action"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="w-16 flex-none text-right text-xs font-bold text-slate-700">
                            {count} · {pct}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : texts.length > 0 ? (
                  <ul className="flex flex-col gap-1.5">
                    {texts.map((text, i) => (
                      <li
                        key={i}
                        className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 wrap-break-word"
                      >
                        {text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400 italic">No answers yet.</p>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-bold tracking-wide text-slate-500 uppercase">
                <th className="px-5 py-3.5">Attendee</th>
                <th className="px-5 py-3.5">Checked In</th>
                {schema.map((q) => (
                  <th key={q.id} className="px-5 py-3.5">
                    {q.label || "Untitled"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-5 py-3.5">
                    <div className="font-bold">
                      {`${row.first_name} ${row.last_name}`.trim() || "—"}
                    </div>
                    <div className="text-xs text-slate-500">{row.email}</div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">
                    {new Date(row.checked_in_at).toLocaleString()}
                  </td>
                  {schema.map((q) => (
                    <td key={q.id} className="px-5 py-3.5 text-slate-600">
                      {formatAnswer(row.answers[q.id]) || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

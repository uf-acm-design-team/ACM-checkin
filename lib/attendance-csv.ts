// Attendance CSV export, with one column per form question.
//
// Split out of the admin dashboard so the Meetings tab and the meeting editor's
// Responses tab produce byte-identical files rather than drifting apart.

import { formatAnswer, type AnswerMap, type FormSchema } from "./form-schema";

export type AttendanceRow = {
  first_name: string;
  last_name: string;
  email: string;
  grad_year: string;
  checked_in_at: string;
  answers: AnswerMap;
};

/**
 * Build the CSV text for one meeting's attendance.
 *
 * Question columns follow schema order, so a reordered form reorders the export
 * -- answers stay with their question because both sides key off question id,
 * never position.
 */
export function buildAttendanceCsv(
  rows: AttendanceRow[],
  schema: FormSchema,
): string {
  const header = [
    "Name",
    "Email",
    "Grad Year",
    "Checked In At",
    ...schema.map((q) => q.label.trim() || "Untitled question"),
  ];

  const body = rows.map((row) => [
    `${row.first_name} ${row.last_name}`.trim(),
    row.email,
    row.grad_year,
    new Date(row.checked_in_at).toLocaleString(),
    ...schema.map((q) => formatAnswer(row.answers[q.id])),
  ]);

  return [header, ...body].map(escapeCsvRow).join("\n");
}

function escapeCsvRow(cells: string[]): string {
  return cells.map(escapeCsvCell).join(",");
}

/**
 * Quote every cell and double any embedded quote.
 *
 * The leading-character guard defuses CSV injection: a cell starting with
 * = + - @ (or tab/CR) is treated as a formula by Excel and Sheets, so an
 * attendee could type `=HYPERLINK(...)` into a free-text answer and have it
 * execute when an officer opens the export. Prefixing a single quote makes the
 * spreadsheet read it as text. This matters more here than in most exports
 * because the answers are attacker-supplied by design -- guest check-in is a
 * public, unauthenticated endpoint.
 */
function escapeCsvCell(value: string): string {
  const text = String(value ?? "");
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** Trigger a browser download of `csv` as `filename`. */
export function downloadCsv(csv: string, filename: string): void {
  // The BOM makes Excel read the file as UTF-8; without it, accented names in
  // the attendee list render as mojibake.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Filesystem-safe name for a meeting's export. */
export function attendanceFilename(meetingTitle: string): string {
  const base = meetingTitle.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");
  return `${base || "meeting"}_attendance.csv`;
}

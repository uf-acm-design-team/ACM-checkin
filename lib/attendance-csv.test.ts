import { describe, it, expect } from "vitest";
import { buildAttendanceCsv, attendanceFilename, type AttendanceRow } from "./attendance-csv";
import type { FormSchema } from "./form-schema";

const row = (over: Partial<AttendanceRow> = {}): AttendanceRow => ({
  first_name: "Alice",
  last_name: "Nguyen",
  email: "alice@ufl.edu",
  grad_year: "2027",
  checked_in_at: "2026-08-15T18:00:00.000Z",
  answers: {},
  ...over,
});

const schema: FormSchema = [
  { id: "q_a", type: "short_text", label: "Source", required: false },
  { id: "q_b", type: "checkboxes", label: "Goals", required: false, options: ["X", "Y"] },
];

describe("buildAttendanceCsv", () => {
  it("appends one column per question, in schema order", () => {
    const [header] = buildAttendanceCsv([], schema).split("\n");
    expect(header).toBe('"Name","Email","Grad Year","Checked In At","Source","Goals"');
  });

  it("looks answers up by question id, not position", () => {
    const csv = buildAttendanceCsv(
      [row({ answers: { q_b: ["X", "Y"], q_a: "Instagram" } })],
      schema,
    );
    expect(csv).toContain('"Instagram","X; Y"');
  });

  it("leaves an unanswered question blank", () => {
    const csv = buildAttendanceCsv([row({ answers: { q_a: "Only this" } })], schema);
    expect(csv.split("\n")[1]).toContain('"Only this",""');
  });

  it("labels an untitled question rather than emitting an empty header", () => {
    const csv = buildAttendanceCsv([], [
      { id: "q_x", type: "short_text", label: "  ", required: false },
    ]);
    expect(csv).toContain('"Untitled question"');
  });

  it("escapes embedded quotes by doubling them", () => {
    const csv = buildAttendanceCsv([row({ answers: { q_a: 'He said "hi"' } })], schema);
    expect(csv).toContain('"He said ""hi"""');
  });

  it("keeps a comma-containing answer inside one field", () => {
    const csv = buildAttendanceCsv([row({ answers: { q_a: "a,b" } })], schema);
    expect(csv.split("\n")[1]).toContain('"a,b"');
  });

  it("defuses formula injection in attacker-supplied answers", () => {
    // Guest check-in is public, so answers are untrusted by design: a leading
    // =, +, - or @ would otherwise execute when an officer opens the export.
    for (const payload of ["=HYPERLINK(1)", "+1+1", "-1", "@SUM(A1)"]) {
      const csv = buildAttendanceCsv([row({ answers: { q_a: payload } })], schema);
      expect(csv).toContain(`"'${payload}"`);
    }
  });

  it("leaves ordinary text unprefixed", () => {
    const csv = buildAttendanceCsv([row({ answers: { q_a: "Instagram" } })], schema);
    expect(csv).toContain('"Instagram"');
    expect(csv).not.toContain(`"'Instagram"`);
  });

  it("emits a header even with no rows", () => {
    expect(buildAttendanceCsv([], schema).split("\n")).toHaveLength(1);
  });
});

describe("attendanceFilename", () => {
  it("replaces spaces and strips punctuation", () => {
    expect(attendanceFilename("ACM Workshop #2")).toBe("ACM_Workshop_2_attendance.csv");
  });

  it("falls back when the title has nothing usable", () => {
    expect(attendanceFilename("///")).toBe("meeting_attendance.csv");
  });
});

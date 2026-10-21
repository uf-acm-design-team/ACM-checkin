
"use client";

import { useState } from "react";

import {
  AttendancePerMeetingChart,
  type AttendanceByMeeting,
  type AttendanceDateRange,
} from "@/components/charts/attendance-per-meeting-chart";

const sampleData: AttendanceByMeeting[] = [
  {
    meeting_id: "1",
    title: "General Body Meeting",
    start_time: "2026-09-03T19:00:00+00:00",
    total: 25,
    members: 20,
    guests: 5,
  },
  {
    meeting_id: "2",
    title: "Technical Workshop",
    start_time: "2026-09-10T19:00:00+00:00",
    total: 38,
    members: 32,
    guests: 6,
  },
  {
    meeting_id: "3",
    title: "Project Meeting",
    start_time: "2026-09-17T19:00:00+00:00",
    total: 31,
    members: 27,
    guests: 4,
  },
  {
    meeting_id: "4",
    title: "Networking Event",
    start_time: "2026-09-24T19:00:00+00:00",
    total: 45,
    members: 36,
    guests: 9,
  },
];

const ranges: Record<string, AttendanceDateRange> = {
  all: {
    from: "2026-09-01T00:00:00-04:00",
    to: "2026-09-30T23:59:59-04:00",
  },
  firstHalf: {
    from: "2026-09-01T00:00:00-04:00",
    to: "2026-09-15T23:59:59-04:00",
  },
  secondHalf: {
    from: "2026-09-16T00:00:00-04:00",
    to: "2026-09-30T23:59:59-04:00",
  },
  noMeetings: {
    from: "2026-10-01T00:00:00-04:00",
    to: "2026-10-31T23:59:59-04:00",
  },
};

export default function AttendanceChartDemoPage() {
  const [selectedRange, setSelectedRange] = useState("all");

  const dateRange = ranges[selectedRange];

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-2 text-3xl font-bold text-ink">
          Attendance per Meeting
        </h1>

        <p className="mb-6 text-ink-muted">
          ADTCIA-51 — Chart demonstration using sample data.
        </p>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <label
            htmlFor="date-range"
            className="text-sm font-medium text-ink"
          >
            Date range:
          </label>

          <select
            id="date-range"
            value={selectedRange}
            onChange={(event) =>
              setSelectedRange(event.target.value)
            }
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
          >
            <option value="all">
              All September meetings
            </option>

            <option value="firstHalf">
              September 1–15
            </option>

            <option value="secondHalf">
              September 16–30
            </option>

            <option value="noMeetings">
              October (no meetings)
            </option>
          </select>
        </div>

        <AttendancePerMeetingChart
          data={sampleData}
          dateRange={dateRange}
        />

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <AttendancePerMeetingChart
            data={sampleData}
            dateRange={dateRange}
            state="loading"
          />

          <AttendancePerMeetingChart
            data={[]}
            dateRange={dateRange}
            state="empty"
          />

          <AttendancePerMeetingChart
            data={sampleData}
            dateRange={dateRange}
            state="error"
            errorMessage="Unable to retrieve attendance data."
          />
        </div>
      </div>
    </main>
  );
}

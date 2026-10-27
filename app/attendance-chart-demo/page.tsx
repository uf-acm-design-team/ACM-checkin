"use client";

import { useState } from "react";

import { AttendancePerMeetingChart } from "@/components/charts/attendance-per-meeting-chart";

type AnalyticsRange = {
  preset: "30d" | "90d" | "custom";
  from: string;
  to: string;
  start: string;
  end: string;
};

const ranges: Record<string, AnalyticsRange> = {
  september: {
    preset: "custom",
    from: "2026-09-01",
    to: "2026-09-30",
    start: "2026-09-01T04:00:00.000Z",
    end: "2026-10-01T03:59:59.999Z",
  },
  october: {
    preset: "custom",
    from: "2026-10-01",
    to: "2026-10-31",
    start: "2026-10-01T04:00:00.000Z",
    end: "2026-11-01T03:59:59.999Z",
  },
  all: {
    preset: "custom",
    from: "2026-09-01",
    to: "2026-10-31",
    start: "2026-09-01T04:00:00.000Z",
    end: "2026-11-01T03:59:59.999Z",
  },
};

export default function AttendanceChartDemoPage() {
  const [selectedRange, setSelectedRange] = useState("all");
  const [orgId, setOrgId] = useState("");

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-2 text-3xl font-bold text-ink">
          Attendance per Meeting
        </h1>

        <p className="mb-6 text-ink-muted">
          ADTCIA-51 — Live Supabase attendance chart demo.
        </p>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <label
            htmlFor="org-id"
            className="text-sm font-medium text-ink"
          >
            Organization ID:
          </label>

          <input
            id="org-id"
            type="text"
            value={orgId}
            onChange={(event) => setOrgId(event.target.value)}
            placeholder="Enter organization UUID"
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
          />

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
            <option value="all">September–October</option>
            <option value="september">September</option>
            <option value="october">October</option>
          </select>
        </div>

        {orgId.trim() ? (
          <AttendancePerMeetingChart
            orgId={orgId.trim()}
            range={ranges[selectedRange]}
          />
        ) : (
          <p className="text-sm text-ink-muted">
            Enter an organization ID to load attendance data.
          </p>
        )}
      </div>
    </main>
  );
}
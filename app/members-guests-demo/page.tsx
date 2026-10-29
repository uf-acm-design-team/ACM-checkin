
"use client";

import { useState } from "react";
import { MembersVsGuestsChart } from "@/components/charts/members-vs-guests-chart";
import type { AnalyticsRange } from "@/lib/analytics-range";

const ranges: Record<string, AnalyticsRange> = {
  september: {
    preset: "custom",
    from: "2026-09-01",
    to: "2026-09-30",
    start: "2026-09-01T04:00:00.000Z",
    end: "2026-10-01T03:59:59.999Z",
  },
  firstHalf: {
    preset: "custom",
    from: "2026-09-01",
    to: "2026-09-15",
    start: "2026-09-01T04:00:00.000Z",
    end: "2026-09-16T03:59:59.999Z",
  },
  secondHalf: {
    preset: "custom",
    from: "2026-09-16",
    to: "2026-09-30",
    start: "2026-09-16T04:00:00.000Z",
    end: "2026-10-01T03:59:59.999Z",
  },
  noMeetings: {
    preset: "custom",
    from: "2026-10-01",
    to: "2026-10-31",
    start: "2026-10-01T04:00:00.000Z",
    end: "2026-11-01T03:59:59.999Z",
  },
};

const sampleData = [
  {
    meeting_id: "1",
    title: "General Body Meeting",
    start_time: "2026-09-03T19:00:00Z",
    members: 20,
    guests: 5,
    total: 25,
  },
  {
    meeting_id: "2",
    title: "Technical Workshop",
    start_time: "2026-09-10T19:00:00Z",
    members: 32,
    guests: 6,
    total: 38,
  },
  {
    meeting_id: "3",
    title: "Project Meeting",
    start_time: "2026-09-17T19:00:00Z",
    members: 27,
    guests: 4,
    total: 31,
  },
  {
    meeting_id: "4",
    title: "Networking Event",
    start_time: "2026-09-24T19:00:00Z",
    members: 36,
    guests: 9,
    total: 45,
  },
];

export default function MembersGuestsDemoPage() {
  const [selectedRange, setSelectedRange] = useState("september");
  const range = ranges[selectedRange];

  const filteredData = sampleData.filter((meeting) => {
    const meetingTime = new Date(meeting.start_time).getTime();

    return (
      meetingTime >= new Date(range.start).getTime() &&
      meetingTime <= new Date(range.end).getTime()
    );
  });

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <h1 className="text-3xl font-bold text-ink">
          Members vs. Guests Chart Demo
        </h1>

        <div>
          <label
            htmlFor="date-range"
            className="mb-2 block text-sm font-medium text-ink"
          >
            Date range
          </label>

          <select
            id="date-range"
            value={selectedRange}
            onChange={(event) =>
              setSelectedRange(event.target.value)
            }
            className="rounded-lg border border-line bg-white p-2 text-ink"
          >
            <option value="september">All September</option>
            <option value="firstHalf">September 1–15</option>
            <option value="secondHalf">September 16–30</option>
            <option value="noMeetings">October (no sample data)</option>
          </select>
        </div>

        <MembersVsGuestsChart
          orgId="demo"
          range={range}
          demoData={filteredData}
        />

        <MembersVsGuestsChart
          orgId="demo"
          range={range}
          demoData={[]}
          demoState="loading"
        />

        <MembersVsGuestsChart
          orgId="demo"
          range={range}
          demoData={[]}
          demoState="empty"
        />

        <MembersVsGuestsChart
          orgId="demo"
          range={range}
          demoData={[]}
          demoState="error"
          demoErrorMessage="Unable to load attendance data."
        />
      </div>
    </main>
  );
}

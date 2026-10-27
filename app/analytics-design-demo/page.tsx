
"use client";

import { useState } from "react";

type MeetingData = {
  name: string;
  total: number;
  newAttendees: number;
  returning: number;
  members: number;
  guests: number;
};

const meetings: MeetingData[] = [
  { name: "Sep 3", total: 28, newAttendees: 18, returning: 10, members: 22, guests: 6 },
  { name: "Sep 10", total: 36, newAttendees: 20, returning: 16, members: 28, guests: 8 },
  { name: "Sep 17", total: 32, newAttendees: 12, returning: 20, members: 25, guests: 7 },
  { name: "Sep 24", total: 45, newAttendees: 21, returning: 24, members: 35, guests: 10 },
];

function ChartFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-white p-5">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function BarChart({
  firstKey,
  secondKey,
  firstLabel,
  secondLabel,
}: {
  firstKey: "newAttendees" | "members";
  secondKey: "returning" | "guests";
  firstLabel: string;
  secondLabel: string;
}) {
  return (
    <>
      <div className="mb-5 flex gap-5 text-sm text-ink-muted">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-accent" />
          {firstLabel}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-ink-muted" />
          {secondLabel}
        </span>
      </div>

      <div className="flex h-52 items-end justify-around gap-4 border-b border-line pb-2">
        {meetings.map((meeting) => (
          <div key={meeting.name} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <div className="flex h-40 w-full max-w-16 flex-col justify-end">
              <div
                className="w-full rounded-t-sm bg-ink-muted"
                style={{ height: `${(meeting[secondKey] / 50) * 100}%` }}
                title={`${secondLabel}: ${meeting[secondKey]}`}
              />
              <div
                className="w-full bg-accent"
                style={{ height: `${(meeting[firstKey] / 50) * 100}%` }}
                title={`${firstLabel}: ${meeting[firstKey]}`}
              />
            </div>
            <span className="text-xs text-ink-muted">{meeting.name}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default function AnalyticsDesignDemo() {
  const [dateRange, setDateRange] = useState("30");

  const points = meetings.map((meeting, index) => ({
    x: 40 + index * 180,
    y: 190 - meeting.total * 3,
  }));

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <main className="min-h-screen bg-canvas p-6 text-ink lg:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-accent">
              Officer Dashboard / Analytics
            </p>
            <h1 className="text-3xl font-bold">Club Analytics</h1>
            <p className="mt-2 text-ink-muted">
              Explore meeting attendance and member engagement.
            </p>
          </div>

          <label className="flex items-center gap-3 text-sm font-medium">
            Date range
            <select
              value={dateRange}
              onChange={(event) => setDateRange(event.target.value)}
              className="rounded-control border border-line bg-white px-4 py-2"
            >
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="custom">Custom range (proposed)</option>
            </select>
          </label>
        </div>

        <div className="mb-8 rounded-card border border-line bg-white p-4">
          <div className="flex gap-6 text-sm font-semibold">
            <span className="text-ink-muted">Overview</span>
            <span className="border-b-2 border-accent pb-2 text-accent">
              Analytics
            </span>
            <span className="text-ink-muted">Meetings</span>
            <span className="text-ink-muted">Attendance</span>
          </div>
        </div>

        <div className="space-y-6">
          <ChartFrame
            title="Attendance per Meeting"
            subtitle="How is meeting attendance changing over time?"
          >
            <svg
              viewBox="0 0 650 240"
              className="h-64 w-full"
              role="img"
              aria-label="Sample attendance trend increasing across four meetings"
            >
              {[40, 90, 140, 190].map((y) => (
                <line
                  key={y}
                  x1="35"
                  y1={y}
                  x2="620"
                  y2={y}
                  stroke="var(--line)"
                  strokeDasharray="4 4"
                />
              ))}
              <path
                d={linePath}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="4"
                strokeLinejoin="round"
              />
              {points.map((point, index) => (
                <g key={meetings[index].name}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="6"
                    fill="var(--accent)"
                  />
                  <text
                    x={point.x}
                    y="225"
                    textAnchor="middle"
                    fontSize="13"
                    fill="var(--ink-muted)"
                  >
                    {meetings[index].name}
                  </text>
                </g>
              ))}
            </svg>
          </ChartFrame>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartFrame
              title="New vs. Returning Attendees"
              subtitle="Are first-time attendees returning to future meetings?"
            >
              <BarChart
                firstKey="newAttendees"
                secondKey="returning"
                firstLabel="New"
                secondLabel="Returning"
              />
            </ChartFrame>

            <ChartFrame
              title="Members vs. Guests"
              subtitle="How much attendance comes from members versus guests?"
            >
              <BarChart
                firstKey="members"
                secondKey="guests"
                firstLabel="Members"
                secondLabel="Guests"
              />
            </ChartFrame>
          </div>

          <h2 className="pt-6 text-xl font-bold">Chart State Mockups</h2>
          <p className="text-sm text-ink-muted">
            Proposed appearance when chart data is loading, unavailable, or missing.
          </p>

          <div className="grid gap-6 lg:grid-cols-3">
            <ChartFrame title="Loading State" subtitle="Waiting for attendance data">
              <div className="h-40 animate-pulse rounded-lg bg-canvas" />
            </ChartFrame>

            <ChartFrame title="Empty State" subtitle="No meetings recorded yet">
              <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-line">
                <p className="font-semibold">No data available</p>
                <p className="mt-2 text-center text-sm text-ink-muted">
                  There is no chart data to display yet.
                </p>
              </div>
            </ChartFrame>

            <ChartFrame title="Error State" subtitle="Unable to retrieve attendance">
              <div className="flex h-40 flex-col justify-center rounded-lg border border-red-200 bg-red-50 p-5">
                <p className="font-semibold text-red-700">Chart unavailable</p>
                <p className="mt-2 text-sm text-red-700">
                  Something went wrong while loading attendance.
                </p>
              </div>
            </ChartFrame>
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-ink-muted">
          ADTCIA-20 · Design mockup only · Sample data · Pending tech lead review
        </p>
      </div>
    </main>
  );
}

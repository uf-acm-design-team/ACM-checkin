
"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartCard } from "./chart-card";
import { ORG_TIME_ZONE } from "@/lib/meeting-time";

export type AttendanceByMeeting = {
  meeting_id: string;
  title: string;
  start_time: string;
  total: number;
  members: number;
  guests: number;
};

// Temporary copy of Lethenial's shared types.
// Import from lib/analytics-range.ts once his PR merges.
export type AnalyticsRange = {
  preset: "30d" | "90d" | "custom";
  from: string;
  to: string;
  start: string;
  end: string;
};

export type AnalyticsChartProps = {
  orgId: string;
  range: AnalyticsRange;
};

type ChartState = "normal" | "loading" | "empty" | "error";

function formatMeetingDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleDateString("en-US", {
    timeZone: ORG_TIME_ZONE,
    month: "short",
    day: "numeric",
  });
}

export function AttendancePerMeetingChart({
  orgId,
  range,
}: AnalyticsChartProps) {
  const [data, setData] = useState<AttendanceByMeeting[]>([]);
  const [state, setState] = useState<ChartState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadAttendance() {
      setState("loading");
      setErrorMessage("");
      setData([]);

      try {
        const params = new URLSearchParams({
          orgId,
          start: range.start,
          end: range.end,
        });

        const response = await fetch(
          `/api/analytics/attendance?${params.toString()}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );

        const result: unknown = await response.json();

        if (!response.ok) {
          const message =
            typeof result === "object" &&
            result !== null &&
            "error" in result &&
            typeof result.error === "string"
              ? result.error
              : "Unable to load attendance data.";

          throw new Error(message);
        }

        if (!Array.isArray(result)) {
          throw new Error("Invalid attendance response.");
        }

        if (controller.signal.aborted) return;

        const attendance = result as AttendanceByMeeting[];

        setData(attendance);
        setState(attendance.length === 0 ? "empty" : "normal");
      } catch (error) {
        if (controller.signal.aborted) return;

        setData([]);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load attendance data.",
        );
        setState("error");
      }
    }

    void loadAttendance();

    return () => controller.abort();
  }, [orgId, range.start, range.end]);

  const chartData = [...data]
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() -
        new Date(b.start_time).getTime(),
    )
    .map((meeting) => ({
      ...meeting,
      meetingDate: formatMeetingDate(meeting.start_time),
    }));

  return (
    <ChartCard
      title="Attendance per Meeting"
      subtitle="How is meeting attendance changing over time?"
      state={state}
      errorMessage={errorMessage}
    >
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{
              top: 10,
              right: 20,
              left: 0,
              bottom: 10,
            }}
          >
            <CartesianGrid
              stroke="var(--line)"
              strokeDasharray="3 3"
            />

            <XAxis
              dataKey="meetingDate"
              stroke="var(--ink-muted)"
              tick={{ fontSize: 12 }}
            />

            <YAxis
              allowDecimals={false}
              stroke="var(--ink-muted)"
              tick={{ fontSize: 12 }}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;

                const meeting = payload[0]
                  .payload as AttendanceByMeeting & {
                    meetingDate: string;
                  };

                return (
                  <div className="rounded-lg border border-line bg-white p-3 shadow-md">
                    <p className="font-semibold text-ink">
                      {meeting.title}
                    </p>

                    <p className="text-sm text-ink-muted">
                      {meeting.meetingDate}
                    </p>

                    <p className="mt-2 text-sm text-ink">
                      Total attendees: {meeting.total}
                    </p>
                  </div>
                );
              }}
            />

            <Line
              type="monotone"
              dataKey="total"
              name="Total attendees"
              stroke="var(--accent)"
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

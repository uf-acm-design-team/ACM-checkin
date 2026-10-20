
"use client";

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

export type AttendanceDateRange = {
  from: string;
  to: string;
};

type ChartState = "normal" | "loading" | "empty" | "error";

type AttendancePerMeetingChartProps = {
  data: AttendanceByMeeting[];
  dateRange: AttendanceDateRange;
  state?: ChartState;
  errorMessage?: string;
};

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
  data,
  dateRange,
  state = "normal",
  errorMessage,
}: AttendancePerMeetingChartProps) {
  const fromTime = new Date(dateRange.from).getTime();
  const toTime = new Date(dateRange.to).getTime();

  const filteredData = data
    .filter((meeting) => {
      const meetingTime = new Date(meeting.start_time).getTime();

      return (
        meetingTime >= fromTime &&
        meetingTime <= toTime
      );
    })
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() -
        new Date(b.start_time).getTime()
    );

  const chartState: ChartState =
    state === "normal" && filteredData.length === 0
      ? "empty"
      : state;

  const chartData = filteredData.map((meeting) => ({
    ...meeting,
    meetingDate: formatMeetingDate(meeting.start_time),
  }));

  return (
    <ChartCard
      title="Attendance per Meeting"
      subtitle="How is meeting attendance changing over time?"
      state={chartState}
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
                if (!active || !payload?.length) {
                  return null;
                }

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

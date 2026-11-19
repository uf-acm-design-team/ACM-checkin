
"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartCard } from "./chart-card";
import { ORG_TIME_ZONE } from "@/lib/meeting-time";
import type { AnalyticsChartProps } from "@/lib/analytics-range";

export type MembersVsGuestsRecord = {
  meeting_id: string;
  title: string;
  start_time: string;
  members: number;
  guests: number;
  total: number;
};

type ChartState = "normal" | "loading" | "empty" | "error";

type MembersVsGuestsChartProps = AnalyticsChartProps & {
  // Optional demo overrides for previewing all four states.
  demoData?: MembersVsGuestsRecord[];
  demoState?: ChartState;
  demoErrorMessage?: string;
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

export function MembersVsGuestsChart({
  orgId,
  range,
  demoData,
  demoState,
  demoErrorMessage,
}: MembersVsGuestsChartProps) {
  const [data, setData] = useState<MembersVsGuestsRecord[]>([]);
  const [state, setState] = useState<ChartState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const start = range.start;
  const end = range.end;
  const isDemo = demoState !== undefined || demoData !== undefined;

  useEffect(() => {
    if (isDemo) return;

    const controller = new AbortController();

    async function loadAttendance() {
      setState("loading");
      setErrorMessage("");
      setData([]);

      try {
        const params = new URLSearchParams({
          orgId,
          start,
          end,
        });

        const response = await fetch(
          `/api/analytics/attendance?${params.toString()}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );

        if (!response.ok) {
          const body = await response.json().catch(() => null);

          throw new Error(
            body?.error || "Unable to load attendance data.",
          );
        }

        const result: MembersVsGuestsRecord[] =
          await response.json();

        if (controller.signal.aborted) return;

        setData(result);
        setState(result.length === 0 ? "empty" : "normal");
      } catch (error) {
        if (controller.signal.aborted) return;

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
  }, [orgId, start, end, isDemo]);

  const displayedData = isDemo ? (demoData ?? []) : data;

  const chartState: ChartState = isDemo
    ? (demoState ??
      (displayedData.length === 0 ? "empty" : "normal"))
    : state;

  const chartData = [...displayedData]
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
      title="Members vs. Guests"
      subtitle="How does attendance break down by attendee type?"
      state={chartState}
      errorMessage={
        isDemo
          ? demoErrorMessage
          : errorMessage
      }
    >
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
          >
            <CartesianGrid
              stroke="var(--line)"
              strokeDasharray="3 3"
              vertical={false}
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
                  .payload as MembersVsGuestsRecord & {
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
                      Members: {meeting.members}
                    </p>
                    <p className="text-sm text-ink">
                      Guests: {meeting.guests}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      Total: {meeting.total}
                    </p>
                  </div>
                );
              }}
            />

            <Legend />

            <Bar
              dataKey="members"
              name="Members"
              stackId="attendance"
              fill="var(--accent)"
            />

            <Bar
              dataKey="guests"
              name="Guests"
              stackId="attendance"
              fill="var(--ink-muted)"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

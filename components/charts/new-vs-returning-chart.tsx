"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";

import { ChartCard } from "./chart-card";
import type { RetentionRecord } from "@/lib/analytics-data";
import { ORG_TIME_ZONE } from "@/lib/meeting-time";

export type NewVsReturningDateRange = {
  from: string;
  to: string;
};

type ChartState = "normal" | "loading" | "empty" | "error";

type NewVsReturningChartProps = {
  data: RetentionRecord[];
  dateRange: NewVsReturningDateRange;
  state?: ChartState;
  errorMessage?: string;
};

// New carries the org accent; returning steps back to a neutral so first-time
// attendees are what the eye lands on. The pair was checked with the dataviz
// palette validator against both the default purple and UF orange accents:
// colour-blind separation clears it comfortably, but the gray is under 3:1 on
// white, which is why the legend and the table view below are not optional.
const NEW_COLOR = "var(--accent)";
const RETURNING_COLOR = "var(--ink-faint)";

// Surface gap between the two stacked segments, and the cap on bar thickness.
const SEGMENT_GAP = 2;
const MAX_BAR_SIZE = 24;
// Titles under the dates only when each meeting's slot has room for them, so a
// narrow card or a long semester degrades to dates alone instead of colliding.
const MIN_SLOT_FOR_TITLE = 72;
const APPROX_CHAR_WIDTH = 6.5;

const RETURNING_NOTE =
  "Returning means they came to an earlier meeting of this club at any point, including before this date range.";

type Row = {
  id: string;
  title: string;
  date: string;
  firstTime: number;
  returning: number;
  total: number;
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

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Postgres bigint counts arrive as numbers from PostgREST today, but coerce so a
// string never concatenates where a sum is expected.
const count = (value: unknown) => Number(value) || 0;

/** Meeting date over a shortened title; the full title is in the tooltip and table. */
function MeetingTick({
  x,
  y,
  payload,
  width,
  visibleTicksCount,
  rows,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value: string };
  width?: number | string;
  visibleTicksCount?: number;
  rows: Row[];
}) {
  const row = rows.find((r) => r.id === payload?.value);
  if (!row) return null;

  const slot = Number(width) / Math.max(1, visibleTicksCount ?? rows.length);
  const titleChars = Math.floor(slot / APPROX_CHAR_WIDTH) - 1;
  const showTitle = slot >= MIN_SLOT_FOR_TITLE;

  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill="var(--ink-muted)" fontSize={12}>
        <tspan x={0} dy={14}>
          {row.date}
        </tspan>
        {showTitle && (
          <tspan x={0} dy={14} fill="var(--ink-faint)">
            {truncate(row.title, titleChars)}
          </tspan>
        )}
      </text>
    </g>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2.5 rounded-sm"
      style={{ background: color }}
    />
  );
}

export function NewVsReturningChart({
  data,
  dateRange,
  state = "normal",
  errorMessage,
}: NewVsReturningChartProps) {
  const fromTime = new Date(dateRange.from).getTime();
  const toTime = new Date(dateRange.to).getTime();

  const rows: Row[] = data
    .filter((meeting) => {
      const meetingTime = new Date(meeting.meeting_start_time).getTime();

      return meetingTime >= fromTime && meetingTime <= toTime;
    })
    .sort(
      (a, b) =>
        new Date(a.meeting_start_time).getTime() -
        new Date(b.meeting_start_time).getTime(),
    )
    .map((meeting) => ({
      id: meeting.meeting_id,
      title: meeting.meeting_title,
      date: formatMeetingDate(meeting.meeting_start_time),
      firstTime: count(meeting.first_time),
      returning: count(meeting.returning),
      total: count(meeting.total),
    }));

  const chartState: ChartState =
    state === "normal" && rows.length === 0 ? "empty" : state;

  // Round only the top of each stack. "New" sits on the baseline, so it gets
  // the rounded end only when no returning segment is stacked on it.
  const newShape = (props: BarShapeProps) => {
    const row = props.payload as Row;
    return (
      <Rectangle {...props} radius={row.returning > 0 ? 0 : [4, 4, 0, 0]} />
    );
  };

  // The returning segment gives up its bottom 2px to the surface gap.
  const returningShape = (props: BarShapeProps) => {
    const row = props.payload as Row;
    const height = Math.max(0, (props.height ?? 0) - (row.firstTime > 0 ? SEGMENT_GAP : 0));
    return <Rectangle {...props} height={height} radius={[4, 4, 0, 0]} />;
  };

  return (
    <ChartCard
      title="New vs. Returning Attendees"
      subtitle="How many people at each meeting are new versus returning?"
      state={chartState}
      errorMessage={errorMessage}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-strong">
          <span className="flex items-center gap-1.5">
            <Swatch color={NEW_COLOR} />
            New (first visit ever)
          </span>
          <span className="flex items-center gap-1.5">
            <Swatch color={RETURNING_COLOR} />
            Returning
          </span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
              accessibilityLayer
            >
              <CartesianGrid stroke="var(--line-soft)" vertical={false} />

              <XAxis
                dataKey="id"
                interval="preserveStartEnd"
                minTickGap={8}
                height={40}
                tickLine={false}
                axisLine={{ stroke: "var(--line)" }}
                tick={<MeetingTick rows={rows} />}
              />

              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                stroke="var(--ink-muted)"
                tick={{ fontSize: 12 }}
                width={32}
              />

              <Tooltip
                cursor={{ fill: "var(--surface-sunken)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) {
                    return null;
                  }

                  const row = payload[0].payload as Row;

                  return (
                    <div className="max-w-64 rounded-lg border border-line bg-white p-3 shadow-md">
                      <p className="font-semibold text-ink">{row.title}</p>
                      <p className="text-sm text-ink-muted">{row.date}</p>

                      <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-sm text-ink">
                        <dt className="flex items-center gap-1.5">
                          <Swatch color={NEW_COLOR} />
                          New
                        </dt>
                        <dd className="text-right tabular-nums">{row.firstTime}</dd>
                        <dt className="flex items-center gap-1.5">
                          <Swatch color={RETURNING_COLOR} />
                          Returning
                        </dt>
                        <dd className="text-right tabular-nums">{row.returning}</dd>
                        <dt className="font-semibold">Total</dt>
                        <dd className="text-right font-semibold tabular-nums">{row.total}</dd>
                      </dl>

                      <p className="mt-2 text-xs leading-snug text-ink-muted">
                        {RETURNING_NOTE}
                      </p>
                    </div>
                  );
                }}
              />

              <Bar
                dataKey="firstTime"
                name="New"
                stackId="visits"
                fill={NEW_COLOR}
                maxBarSize={MAX_BAR_SIZE}
                shape={newShape}
              />
              <Bar
                dataKey="returning"
                name="Returning"
                stackId="visits"
                fill={RETURNING_COLOR}
                maxBarSize={MAX_BAR_SIZE}
                shape={returningShape}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Guests are counted (ADTCIA-49), so say so where the definition lives. */}
        <p className="m-0 text-xs text-ink-muted">
          {RETURNING_NOTE} Counts include guest check-ins.
        </p>

        {/* Every value outside the tooltip, for keyboard and screen-reader
            users and anyone who can't separate the two fills. */}
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-muted">Show as table</summary>
          <table className="mt-2 w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th className="py-1 pr-3 font-medium">Meeting</th>
                <th className="py-1 pr-3 font-medium">Date</th>
                <th className="py-1 pr-3 text-right font-medium">New</th>
                <th className="py-1 pr-3 text-right font-medium">Returning</th>
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-ink">
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line-soft">
                  <td className="py-1 pr-3">{row.title}</td>
                  <td className="py-1 pr-3">{row.date}</td>
                  <td className="py-1 pr-3 text-right">{row.firstTime}</td>
                  <td className="py-1 pr-3 text-right">{row.returning}</td>
                  <td className="py-1 text-right">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </ChartCard>
  );
}

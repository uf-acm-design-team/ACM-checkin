
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { ChartCard } from "./chart-card";

const demoData = [
  { week: "Week 1", attendance: 20 },
  { week: "Week 2", attendance: 35 },
  { week: "Week 3", attendance: 28 },
  { week: "Week 4", attendance: 42 },
];

export default function ChartCardDemo() {
  return (
    <ChartCard
      title="Meeting Attendance"
      subtitle="Example attendance over four weeks"
    >
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={demoData}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
            <XAxis dataKey="week" stroke="var(--ink-muted)" />
            <YAxis stroke="var(--ink-muted)" />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="attendance"
              stroke="var(--accent)"
              strokeWidth={3}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

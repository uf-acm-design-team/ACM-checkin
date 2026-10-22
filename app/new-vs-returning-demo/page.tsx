import type { CSSProperties } from "react";
import { notFound } from "next/navigation";

import {
  NewVsReturningChart,
  type NewVsReturningDateRange,
} from "@/components/charts/new-vs-returning-chart";
import type { RetentionRecord } from "@/lib/analytics-data";
import { brandingToCssVars, cssVarsToStyle, DEFAULT_BRANDING } from "@/lib/branding";

// Design sandbox for the New vs. Returning chart: every ChartCard state in both
// the default purple and UF orange accents, on hard-coded data. Not a product
// page -- 404s outside development.

const RANGE: NewVsReturningDateRange = {
  from: "2026-08-01T00:00:00Z",
  to: "2026-12-31T23:59:59Z",
};

const SAMPLE: RetentionRecord[] = [
  { meeting_id: "m1", meeting_title: "Kickoff", meeting_start_time: "2026-08-27T23:00:00Z", first_time: 42, returning: 0, total: 42 },
  { meeting_id: "m2", meeting_title: "Resume Workshop", meeting_start_time: "2026-09-03T23:00:00Z", first_time: 11, returning: 27, total: 38 },
  { meeting_id: "m3", meeting_title: "Intro to Git and GitHub for Beginners", meeting_start_time: "2026-09-10T23:00:00Z", first_time: 6, returning: 25, total: 31 },
  { meeting_id: "m4", meeting_title: "Tech Talk: Cloud", meeting_start_time: "2026-09-17T23:00:00Z", first_time: 9, returning: 22, total: 31 },
  { meeting_id: "m5", meeting_title: "Rained out", meeting_start_time: "2026-09-24T23:00:00Z", first_time: 0, returning: 0, total: 0 },
  { meeting_id: "m6", meeting_title: "Hack Night", meeting_start_time: "2026-10-01T23:00:00Z", first_time: 4, returning: 30, total: 34 },
];

const THEMES: { name: string; style?: CSSProperties }[] = [
  { name: "Default purple" },
  { name: "UF orange", style: cssVarsToStyle(brandingToCssVars(DEFAULT_BRANDING)) },
];

export default function NewVsReturningDemoPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        {THEMES.map((theme) => (
          <section key={theme.name} className="flex flex-col gap-4" style={theme.style}>
            <h2 className="text-xl font-bold text-ink">{theme.name}</h2>
            <NewVsReturningChart data={SAMPLE} dateRange={RANGE} />
            <div className="grid gap-4 md:grid-cols-3">
              <NewVsReturningChart data={SAMPLE} dateRange={RANGE} state="loading" />
              <NewVsReturningChart data={[]} dateRange={RANGE} />
              <NewVsReturningChart
                data={SAMPLE}
                dateRange={RANGE}
                state="error"
                errorMessage="Failed to fetch attendance data: Unauthorized"
              />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

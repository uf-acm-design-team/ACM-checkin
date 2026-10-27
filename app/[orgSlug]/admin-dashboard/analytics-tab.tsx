"use client";

import { ChartCard } from "@/components/charts/chart-card";

// Layout from docs/ANALYTICS-DASHBOARD-DESIGN.md section 2. The cards are
// loading placeholders until the chart components land.
export default function AnalyticsTab() {
  return (
    <div className="space-y-6">
      <ChartCard
        title="Attendance per Meeting"
        subtitle="Is meeting attendance increasing or decreasing over time?"
        state="loading"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="New vs. Returning Attendees"
          subtitle="How many attendees are new versus returning at each meeting?"
          state="loading"
        />
        <ChartCard
          title="Members vs. Guests"
          subtitle="How much attendance comes from members versus guests?"
          state="loading"
        />
      </div>
    </div>
  );
}

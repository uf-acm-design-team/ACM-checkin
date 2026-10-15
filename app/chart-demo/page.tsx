
import ChartCardDemo from "@/components/charts/chart-card-demo";
import { ChartCard } from "@/components/charts/chart-card";

export default function ChartDemoPage() {
  return (
    <main className="min-h-screen bg-canvas p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-2xl font-bold text-ink">
          ChartCard Demo
        </h1>

        <h2 className="text-xl font-bold text-ink">
          Default Purple Accent
        </h2>
        <ChartCardDemo />

        <h2 className="text-xl font-bold text-ink">
          UF Orange Accent
        </h2>
        <div style={{ "--accent": "#FA4616" } as React.CSSProperties}>
          <ChartCardDemo />
        </div>

        <ChartCard
          title="Loading State"
          subtitle="Waiting for attendance data"
          state="loading"
        />

        <ChartCard
          title="Empty State"
          subtitle="No meetings recorded yet"
          state="empty"
        />

        <ChartCard
          title="Error State"
          subtitle="Unable to retrieve attendance"
          state="error"
          errorMessage="Something went wrong while loading attendance."
        />
      </div>
    </main>
  );
}

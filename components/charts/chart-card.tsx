
import type { ReactNode } from "react";
import { EmptyState, Notice, Skeleton } from "@/components/ui/primitives";

type ChartCardProps = {
  title: string;
  subtitle?: string;
  rangeControl?: ReactNode;
  children?: ReactNode;
  state?: "loading" | "empty" | "error" | "normal";
  errorMessage?: string;
};

export function ChartCard({
  title,
  subtitle,
  rangeControl,
  children,
  state = "normal",
  errorMessage = "Unable to load chart data.",
}: ChartCardProps) {
  return (
    <section className="rounded-card border border-line bg-white p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          {subtitle && (
            <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
          )}
        </div>

        {rangeControl && <div>{rangeControl}</div>}
      </div>

      {state === "loading" ? (
        <div role="status" aria-label="Loading chart">
          <Skeleton className="h-56 w-full" />
        </div>
      ) : state === "empty" ? (
        <EmptyState title="No data available">
          There is no chart data to display yet.
        </EmptyState>
      ) : state === "error" ? (
        <Notice tone="bad" title="Chart unavailable">
          {errorMessage}
        </Notice>
      ) : (
        <div className="min-h-56">{children}</div>
      )}
    </section>
  );
}

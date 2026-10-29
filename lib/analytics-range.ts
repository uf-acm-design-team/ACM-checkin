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
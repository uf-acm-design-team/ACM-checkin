"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChartCard } from "@/components/charts/chart-card";
import { Button, Notice } from "@/components/ui/primitives";
import {
  parseAnalyticsRange,
  rangeToSearchParams,
  type AnalyticsRange,
  type RangePreset,
} from "@/lib/analytics-range";

const ANALYTICS_PARAMS = ["tab", "range", "from", "to"];

// Edits the query in place so unrelated params (e.g. feed=poll) survive.
// Next keeps useSearchParams in sync with history.replaceState.
function replaceQuery(update: (params: URLSearchParams) => void) {
  const params = new URLSearchParams(window.location.search);
  update(params);
  const query = params.toString();
  const { pathname, hash } = window.location;
  window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}${hash}`);
}

/** Drops the Analytics params when the user switches to another tab. */
export function clearAnalyticsParams() {
  replaceQuery((params) => ANALYTICS_PARAMS.forEach((key) => params.delete(key)));
}

const fmtDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "custom", label: "Custom" },
];

function RangeSelector({
  range,
  onChange,
}: {
  range: AnalyticsRange;
  onChange: (range: AnalyticsRange) => void;
}) {
  const [customOpen, setCustomOpen] = useState(range.preset === "custom");
  const [draft, setDraft] = useState({ from: range.from, to: range.to });
  const [error, setError] = useState<string | null>(null);
  const selected = customOpen ? "custom" : range.preset;

  const selectPreset = (key: RangePreset) => {
    setError(null);
    if (key === "custom") {
      setDraft({ from: range.from, to: range.to });
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onChange(parseAnalyticsRange({ range: key }, new Date()).range);
  };

  const applyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const result = parseAnalyticsRange({ range: "custom", ...draft }, new Date());
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onChange(result.range);
  };

  return (
    <div className="flex flex-col items-stretch gap-3 sm:items-end">
      <div
        role="group"
        aria-label="Date range"
        className="flex gap-1.5 rounded-control bg-surface-sunken p-1"
      >
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={selected === p.key}
            onClick={() => selectPreset(p.key)}
            className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-[13px] font-bold transition-all sm:flex-none sm:px-4 ${
              selected === p.key
                ? "bg-white text-ink-strong shadow-sm"
                : "text-ink-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {customOpen && (
        <form
          onSubmit={applyCustom}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="text-xs font-bold text-ink-muted">
            <span className="mb-1.5 block">From</span>
            <input
              type="date"
              required
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="text-xs font-bold text-ink-muted">
            <span className="mb-1.5 block">To</span>
            <input
              type="date"
              required
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
            />
          </label>
          <Button type="submit" size="sm">
            Apply
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="m-0 text-xs text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

// Layout from docs/ANALYTICS-DASHBOARD-DESIGN.md section 2. The cards are
// loading placeholders until the chart components land.
export default function AnalyticsTab() {
  const searchParams = useSearchParams();
  const result = parseAnalyticsRange(
    {
      range: searchParams.get("range"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    },
    new Date(),
  );
  const { range } = result;

  // Keep ?tab=analytics in the URL so a reload or shared link reopens this tab.
  useEffect(() => {
    if (searchParams.get("tab") !== "analytics") {
      replaceQuery((params) => params.set("tab", "analytics"));
    }
  }, [searchParams]);

  const setRange = (next: AnalyticsRange) =>
    replaceQuery((params) => {
      ["range", "from", "to"].forEach((key) => params.delete(key));
      params.set("tab", "analytics");
      for (const [key, value] of Object.entries(rangeToSearchParams(next))) {
        params.set(key, value);
      }
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="m-0 pt-2 text-sm font-semibold text-ink-muted">
          {fmtDay(range.from)} – {fmtDay(range.to)}
        </p>
        <RangeSelector range={range} onChange={setRange} />
      </div>

      {!result.ok && (
        <Notice tone="warn" title="Invalid date range in the link">
          {result.error} Showing the last 30 days instead.
        </Notice>
      )}

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

"use client";

import { cn } from "@/lib/utils";

export type MeetingView = "attended" | "missed" | "all";

const OPTIONS: { value: MeetingView; label: string }[] = [
  { value: "attended", label: "Attended" },
  { value: "missed", label: "Missed" },
  { value: "all", label: "All" },
];

/**
 * The attended/missed/all switch.
 *
 * Was a dropdown; the wireframe makes it an underlined tab strip with the count
 * baked into each label. Three options never justified a menu -- collapsing them
 * hid the counts, which are the most useful part, behind a click.
 */
export function ViewToggle({
  value,
  counts,
  onChange,
}: {
  value: MeetingView;
  /** Per-view totals rendered beside each label, when known. */
  counts?: Partial<Record<MeetingView, number>>;
  onChange: (value: MeetingView) => void;
}) {
  return (
    <div role="tablist" aria-label="Meeting view" className="flex gap-4">
      {OPTIONS.map((option) => {
        const isActive = option.value === value;
        const count = counts?.[option.value];
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "cursor-pointer border-b-2 pb-1.5 text-[13px] font-semibold transition-colors",
              isActive
                ? "border-accent text-ink"
                : "border-transparent text-ink-faint hover:text-ink-muted",
            )}
          >
            {option.label}
            {count != null && (
              <span aria-hidden="true"> · {count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

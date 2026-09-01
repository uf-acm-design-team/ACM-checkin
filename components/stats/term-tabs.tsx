"use client";

import { cn } from "@/lib/utils";
import type { Scope, TermSummary } from "@/lib/stats-terms";

/**
 * The semester switch. Equal-width segments in a single row -- the wireframe's
 * treatment, which reads as one control rather than a row of loose pills.
 *
 * The active segment is solid ink, not the accent: the accent is already
 * carrying the membership card directly above, and two accent fields stacked
 * make neither one read as primary.
 */
export function TermTabs({
  terms,
  activeScope,
  onSelect,
}: {
  terms: TermSummary[];
  activeScope: Scope;
  onSelect: (scope: Scope) => void;
}) {
  const tabs: { key: Scope; label: string }[] = [
    ...terms.map((t) => ({ key: t.key as Scope, label: t.label })),
    { key: "all" as Scope, label: "All" },
  ];

  return (
    <div
      role="tablist"
      aria-label="Semester"
      className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeScope;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onSelect(tab.key)}
            className={cn(
              "flex-1 shrink-0 cursor-pointer rounded-control px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors",
              isActive
                ? "bg-ink text-white"
                : "border border-line bg-surface text-ink-muted hover:bg-surface-sunken",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils";
import type { Scope, TermSummary } from "@/lib/stats-terms";

export function TermTabs({
  terms,
  activeScope,
  onSelect,
}: {
  terms: TermSummary[];
  activeScope: Scope;
  onSelect: (scope: Scope) => void;
}) {
  const tabs: { key: Scope; label: string; count: string }[] = [
    ...terms.map((t) => ({
      key: t.key as Scope,
      label: t.label,
      count: `${t.attended}/${t.total}`,
    })),
    { key: "all" as Scope, label: "All semesters", count: "" },
  ];

  return (
    <div
      role="tablist"
      aria-label="Semester"
      className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none",
              isActive
                // The glow was a hardcoded red rgba(), which stayed red no
                // matter what accent an org picked. Derive it from the live
                // --brand-action instead so it tints with the club's color.
                ? "bg-brand-action text-white shadow-[0_4px_12px_color-mix(in_srgb,var(--brand-action)_45%,transparent)]"
                : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white",
            )}
          >
            {tab.label}
            {tab.count && <span className="ml-1.5 text-xs opacity-70">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

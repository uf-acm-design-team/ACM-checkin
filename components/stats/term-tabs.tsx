"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import { MeetingsList } from "./meetings-list";
import {
  type Meeting,
  type Term,
  compareTermsDesc,
  getTerm,
} from "./mock-meetings";

type GroupedTerm = {
  term: Term;
  meetings: Meeting[];
};

function groupByTerm(meetings: Meeting[]): GroupedTerm[] {
  const map = new Map<string, GroupedTerm>();
  for (const meeting of meetings) {
    const term = getTerm(meeting.start_time);
    const existing = map.get(term.key);
    if (existing) {
      existing.meetings.push(meeting);
    } else {
      map.set(term.key, { term, meetings: [meeting] });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => compareTermsDesc(a.term, b.term))
    .map((group) => ({
      ...group,
      meetings: [...group.meetings].sort(
        (a, b) =>
          new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
      ),
    }));
}

export function TermTabs({
  meetings,
  emptyMessage,
}: {
  meetings: Meeting[];
  emptyMessage?: string;
}) {
  const groups = useMemo(() => groupByTerm(meetings), [meetings]);
  const [activeKey, setActiveKey] = useState(groups[0]?.term.key ?? "");

  if (groups.length === 0) {
    return <MeetingsList meetings={[]} emptyMessage={emptyMessage} />;
  }

  const active = groups.find((g) => g.term.key === activeKey) ?? groups[0];

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Semester"
        className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {groups.map(({ term, meetings: termMeetings }) => {
          const isActive = term.key === active.term.key;
          return (
            <button
              key={term.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => setActiveKey(term.key)}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-action text-white shadow-[0_4px_12px_rgba(225,59,53,0.3)]"
                  : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
              )}
            >
              {term.label}
              <span className="ml-1.5 text-xs opacity-70">
                {termMeetings.length}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        aria-label={active.term.label}
        className="max-h-[60vh] overflow-y-auto pr-1"
      >
        <MeetingsList meetings={active.meetings} emptyMessage={emptyMessage} />
      </div>
    </div>
  );
}

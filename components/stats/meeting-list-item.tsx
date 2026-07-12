"use client";

import { useState } from "react";
import { Calendar, Info } from "lucide-react";

import type { Meeting } from "./mock-meetings";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function MeetingListItem({ meeting }: { meeting: Meeting }) {
  const [showInfo, setShowInfo] = useState(false);
  const hasInfo = Boolean(meeting.description?.trim());

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-background">
          <Calendar className="h-5 w-5 text-brand-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {meeting.title}
          </p>
          <p className="text-xs text-white/60">
            {DATE_FORMAT.format(new Date(meeting.start_time))}
          </p>
        </div>
        {hasInfo && (
          <button
            type="button"
            onClick={() => setShowInfo((prev) => !prev)}
            aria-expanded={showInfo}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/25 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10"
          >
            <Info className="h-3.5 w-3.5" />
            Meeting info
          </button>
        )}
      </div>
      {hasInfo && showInfo && (
        <p className="rounded-lg bg-white/5 px-3 py-2 text-xs leading-relaxed text-white/70">
          {meeting.description}
        </p>
      )}
    </li>
  );
}

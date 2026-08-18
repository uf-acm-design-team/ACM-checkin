"use client";

import { useState } from "react";
import { Calendar, Info } from "lucide-react";

import type { StatsMeeting } from "@/lib/stats-terms";
import { MeetingDetailsModal } from "./meeting-details-modal";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function MeetingListItem({ meeting }: { meeting: StatsMeeting }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Tinted from the org accent rather than bg-brand-background, which on
            this card sat on the gradient's own bottom color and disappeared. */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[color-mix(in_srgb,var(--brand-primary)_22%,transparent)]">
          <Calendar className="h-5 w-5 text-brand-primary" />
        </div>
        <div className="min-w-0 flex-1">
          {/* Wraps to two lines rather than truncating -- on a narrow card the
              truncated form often cuts the title before it's identifiable. */}
          <p className="line-clamp-2 text-sm font-semibold text-white">
            {meeting.title}
          </p>
          <p className="text-xs text-white/60">
            {DATE_FORMAT.format(new Date(meeting.start_time))}
          </p>
        </div>
        {meeting.hasDetails && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/25 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
          >
            <Info className="h-3.5 w-3.5" />
            Details
          </button>
        )}
      </div>
      {showModal && (
        <MeetingDetailsModal meetingId={meeting.id} onClose={() => setShowModal(false)} />
      )}
    </li>
  );
}

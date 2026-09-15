"use client";

import { useState } from "react";

import type { StatsMeeting } from "@/lib/stats-terms";
import { cn } from "@/lib/utils";
import { MeetingDetailsModal } from "./meeting-details-modal";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

/**
 * One meeting row.
 *
 * The wireframe's version carries the verdict as a single glyph on the right --
 * a green tick for attended, a grey dash for missed, with the whole row dimmed.
 * That reads down a long list far faster than a badge per row, and it keeps the
 * title as the thing the eye lands on.
 */
export function MeetingListItem({ meeting }: { meeting: StatsMeeting }) {
  const [showModal, setShowModal] = useState(false);
  const date = new Date(meeting.start_time);
  const attended = meeting.attended;

  const meta = [
    DATE_FORMAT.format(date),
    attended ? TIME_FORMAT.format(date) : "missed",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="rounded-card border border-line bg-surface shadow-[var(--shadow-card)]">
      {/* Dimming lives on the row content, not the <li> -- the details modal
          below is also a child of this <li>, and CSS opacity cascades into
          descendants regardless of their own position, so putting it on the
          <li> washed out the modal (and its backdrop) for missed meetings. */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 p-3.5",
          !attended && "opacity-65",
        )}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-[15px] font-semibold text-ink">
            {meeting.title}
          </span>
          <span className="text-[12.5px] text-ink-faint">{meta}</span>
        </div>

        <div className="flex flex-none items-center gap-2">
          {meeting.hasDetails && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="cursor-pointer rounded-control border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-strong transition-colors hover:bg-surface-sunken"
            >
              Details
            </button>
          )}
          <span
            aria-label={attended ? "Attended" : "Missed"}
            className={cn(
              "text-base",
              attended ? "text-good" : "text-ink-faint",
            )}
          >
            {attended ? "✓" : "—"}
          </span>
        </div>
      </div>

      {showModal && (
        <MeetingDetailsModal
          meetingId={meeting.id}
          onClose={() => setShowModal(false)}
        />
      )}
    </li>
  );
}

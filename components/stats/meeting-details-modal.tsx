"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { getMeetingDetails } from "@/lib/stats-data";
import { formatAnswer } from "@/lib/form-schema";
import type { MeetingDetails } from "@/lib/stats-terms";
import { Skeleton } from "@/components/ui/primitives";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short", month: "short", day: "numeric", year: "numeric",
});

// Only one details sheet is ever mounted at a time (the list item unmounts it
// on close), so a module-level id is unambiguous.
const TITLE_ID = "meeting-details-title";

export function MeetingDetailsModal({
  meetingId,
  onClose,
}: {
  meetingId: string;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<MeetingDetails | null>(null);

  useEffect(() => {
    let active = true;
    getMeetingDetails(meetingId).then((d) => {
      if (active) setDetails(d);
    });
    return () => {
      active = false;
    };
  }, [meetingId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // Freeze the page behind the sheet -- without this a scroll gesture on
    // mobile pans the list underneath instead of the modal's own content.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={details ? TITLE_ID : undefined}
      aria-busy={!details}
    >
      {/* A white sheet on a dimmed page. The scrim is the ink colour at low
          alpha rather than pure black, so the page behind reads as dimmed
          rather than switched off. */}
      <div
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-panel border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:max-w-lg sm:rounded-panel sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {!details ? (
          // Skeleton rather than a bare word: the sheet is already on screen at
          // full size, so an unsized "Loading…" collapses it and then snaps to
          // full height when the fetch lands.
          <div aria-hidden="true" className="flex flex-col gap-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-16 rounded-card" />
            <Skeleton className="h-16 rounded-card" />
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  id={TITLE_ID}
                  className="m-0 text-lg font-bold text-ink wrap-break-word"
                >
                  {details.title}
                </h2>
                <p className="m-0 text-[12.5px] text-ink-faint">
                  {DATE_FORMAT.format(new Date(details.start_time))}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-m-2 flex-none cursor-pointer rounded-control p-2 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {details.description && (
              <p className="mb-4 rounded-card bg-surface-sunken px-3.5 py-2.5 text-sm text-ink-muted">
                {details.description}
              </p>
            )}

            {details.questions.length > 0 ? (
              <ul className="flex list-none flex-col gap-2 p-0">
                {/* Answers are looked up BY QUESTION ID, never by position --
                    that is what keeps an officer reordering the form from
                    re-pointing everyone's saved answers. */}
                {details.questions.map((q) => (
                  <li
                    key={q.id}
                    className="rounded-card border border-line px-3.5 py-3"
                  >
                    <p className="m-0 text-[13px] font-semibold text-ink-strong wrap-break-word">
                      {q.label}
                    </p>
                    {details.answers ? (
                      <p className="m-0 mt-1 text-sm text-ink wrap-break-word">
                        {formatAnswer(details.answers[q.id]) || "—"}
                      </p>
                    ) : (
                      <p className="m-0 mt-1 text-xs text-ink-faint italic">
                        You did not attend this meeting.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-sm text-ink-faint">
                No questions were asked at this meeting.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

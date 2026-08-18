"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { getMeetingDetails } from "@/lib/stats-data";
import { formatAnswer } from "@/lib/form-schema";
import type { MeetingDetails } from "@/lib/stats-terms";

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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={details ? TITLE_ID : undefined}
      aria-busy={!details}
    >
      {/* --brand-background is also the gradient's bottom stop, so a panel
          painted with it reads as a flat slab rather than a raised surface.
          Use the org's secondary background (its designated panel color) under
          the same translucent-white wash the other pages use. */}
      <div
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border border-white/20 bg-brand-background-secondary/95 p-5 shadow-2xl backdrop-blur-md sm:max-w-lg sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {!details ? (
          // Skeleton rather than a bare word: the sheet is already on screen at
          // full size, so an unsized "Loading…" collapses it and then snaps to
          // full height when the fetch lands.
          <div aria-hidden="true" className="animate-pulse space-y-3">
            <div className="h-5 w-2/3 rounded bg-white/15" />
            <div className="h-3 w-1/3 rounded bg-white/10" />
            <div className="h-16 rounded-lg bg-white/5" />
            <div className="h-16 rounded-lg bg-white/5" />
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id={TITLE_ID} className="text-lg font-bold text-white wrap-break-word">
                  {details.title}
                </h2>
                <p className="text-xs text-white/60">
                  {DATE_FORMAT.format(new Date(details.start_time))}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-m-2 flex-none rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {details.description && (
              <p className="mb-4 rounded-lg bg-white/5 px-3 py-2 text-sm text-white/70">
                {details.description}
              </p>
            )}

            {details.questions.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {/* Answers are looked up BY QUESTION ID, never by position --
                    that is what keeps an officer reordering the form from
                    re-pointing everyone's saved answers. */}
                {details.questions.map((q) => (
                  <li key={q.id} className="rounded-lg bg-white/5 px-3 py-2">
                    <p className="text-sm font-medium text-white wrap-break-word">
                      {q.label}
                    </p>
                    {details.answers ? (
                      <p className="mt-1 text-sm text-brand-primary wrap-break-word">
                        {formatAnswer(details.answers[q.id]) || "—"}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs italic text-white/40">
                        You did not attend this meeting.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-white/50">No questions were asked at this meeting.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

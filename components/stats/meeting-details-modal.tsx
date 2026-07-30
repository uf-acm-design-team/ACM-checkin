"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { getMeetingDetails } from "@/lib/stats-data";
import type { MeetingDetails } from "@/lib/stats-terms";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short", month: "short", day: "numeric", year: "numeric",
});

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
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/15 bg-brand-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!details ? (
          <p className="text-white/60">Loading…</p>
        ) : (
          <>
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">{details.title}</h2>
                <p className="text-xs text-white/60">
                  {DATE_FORMAT.format(new Date(details.start_time))}
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="text-white/60 hover:text-white">
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
                {details.questions.map((q, i) => (
                  <li key={i} className="rounded-lg bg-white/5 px-3 py-2">
                    <p className="text-sm font-medium text-white">{q}</p>
                    {details.answers ? (
                      <p className="mt-1 text-sm text-brand-primary">
                        {details.answers[i] || "—"}
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

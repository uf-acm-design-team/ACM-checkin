"use client";

import { useState } from "react";

import { useBranding } from "@/app/components/BrandingProvider";
import { MembershipBadge } from "./membership-badge";
import { TermTabs } from "./term-tabs";
import { ViewToggle, type MeetingView } from "./view-toggle";
import type { Meeting } from "./mock-meetings";

const MEMBERSHIP_THRESHOLD = 5;

export function StatsView({
  attendedMeetings,
  clubMeetings,
}: {
  attendedMeetings: Meeting[];
  clubMeetings: Meeting[];
}) {
  const [view, setView] = useState<MeetingView>("attended");
  const { name } = useBranding();

  const attendedCount = attendedMeetings.length;
  const isMember = attendedCount >= MEMBERSHIP_THRESHOLD;
  const remaining = Math.max(MEMBERSHIP_THRESHOLD - attendedCount, 0);

  const isAttendedView = view === "attended";
  const meetings = isAttendedView ? attendedMeetings : clubMeetings;
  const heading = isAttendedView ? "Meetings Attended" : "Club Meetings";

  const countLabel = isAttendedView
    ? isMember
      ? `${attendedCount} meetings attended across all semesters`
      : `${attendedCount} of ${MEMBERSHIP_THRESHOLD} meetings attended — ${remaining} more to become a member`
    : `${clubMeetings.length} club ${
        clubMeetings.length === 1 ? "meeting" : "meetings"
      } across all semesters`;

  const emptyMessage = isAttendedView
    ? `No meetings attended yet. Check in at the next ${name} event!`
    : "No club meetings yet. Check back soon!";

  return (
    <section className="flex flex-1 flex-col gap-6 px-6 py-8 md:px-10 md:py-12">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-primary">
            Your Activity
          </p>
          <MembershipBadge isMember={isMember} orgName={name} />
          <ViewToggle value={view} onChange={setView} />
        </div>
        <h1 className="text-2xl font-bold text-white md:text-3xl">{heading}</h1>
        <p className="text-sm text-white/60">{countLabel}</p>
      </header>

      <TermTabs meetings={meetings} emptyMessage={emptyMessage} />
    </section>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";

import { useBranding } from "@/app/components/BrandingProvider";
import { getMeetingsPage } from "@/lib/stats-data";
import {
  percentage,
  type MemberStats,
  type Page,
  type Scope,
  type StatsMeeting,
} from "@/lib/stats-terms";
import { MembershipBadge } from "./membership-badge";
import { MeetingsList } from "./meetings-list";
import { TermTabs } from "./term-tabs";
import { ViewToggle, type MeetingView } from "./view-toggle";

export function StatsView({
  stats,
  initialScope,
  initialPage,
}: {
  stats: MemberStats;
  initialScope: Scope;
  initialPage: Page<StatsMeeting>;
}) {
  const { name } = useBranding();
  const [scope, setScope] = useState<Scope>(initialScope);
  const [view, setView] = useState<MeetingView>("attended");
  const [page, setPage] = useState<Page<StatsMeeting>>(initialPage);
  const [items, setItems] = useState<StatsMeeting[]>(initialPage.items);
  const [pending, startTransition] = useTransition();

  // Every fetch bumps this; a response only updates state if it's still the
  // latest request. Without this, rapidly switching tab/view races the async
  // getMeetingsPage calls and whichever RESOLVES last wins — which can be a
  // stale request, leaving the list out of sync with the active tab/view.
  const requestId = useRef(0);

  function refetch(nextScope: Scope, nextView: MeetingView) {
    const id = ++requestId.current;
    startTransition(async () => {
      const res = await getMeetingsPage(stats.orgId, nextScope, nextView, 1);
      if (id !== requestId.current) return; // superseded by a newer request
      setPage(res);
      setItems(res.items);
    });
  }

  function onSelectScope(next: Scope) {
    setScope(next);
    refetch(next, view);
  }
  function onChangeView(next: MeetingView) {
    setView(next);
    refetch(scope, next);
  }
  function onLoadMore() {
    const id = ++requestId.current;
    const nextPage = page.page + 1;
    startTransition(async () => {
      const res = await getMeetingsPage(stats.orgId, scope, view, nextPage);
      if (id !== requestId.current) return; // scope/view changed mid-load
      setPage(res);
      setItems((prev) => [...prev, ...res.items]);
    });
  }

  const activeTerm = scope === "all" ? null : stats.terms.find((t) => t.key === scope);
  const scopeLabel = activeTerm?.label ?? "all semesters";
  const attended = scope === "all" ? stats.attendedAllTime : activeTerm?.attended ?? 0;
  const total = scope === "all" ? stats.totalAllTime : activeTerm?.total ?? 0;
  const pct = percentage(attended, total);

  const emptyMessage =
    view === "attended"
      ? `No meetings attended yet. Check in at the next ${name} event!`
      : view === "missed"
        ? "No missed meetings here."
        : "No club meetings yet. Check back soon!";

  return (
    <section className="flex flex-1 flex-col gap-5 px-4 py-8 sm:px-6 md:gap-6 md:px-10 md:py-12">
      {/* The summary now sits in the same glass panel the club home and
          check-in pages use. Previously these lines floated straight on the
          gradient, so the page had no anchoring surface and the particle field
          ran directly behind the numbers. */}
      <header className="rounded-2xl border border-white/20 bg-white/10 p-5 shadow-2xl backdrop-blur-md sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* NOT text-brand-primary: this panel sits at the top of the page
              where the gradient is still showing --brand-primary itself, so an
              accent-colored eyebrow renders orange-on-orange (and green-on-green
              for an org themed that way). White at reduced opacity keeps it
              legible against every org palette. */}
          <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
            Your Activity
          </p>
          <MembershipBadge isMember={stats.isMember} orgName={name} role={stats.role} />
          {/* Pushed to the row's end so it reads as a control, not a third label. */}
          <div className="ml-auto">
            <ViewToggle value={view} onChange={onChangeView} />
          </div>
        </div>

        <h1 className="mt-2 text-xl font-bold text-white sm:text-2xl md:text-3xl">
          Your Attendance
        </h1>

        {/* The scoped ratio as a figure rather than prose -- it is the number
            the page exists to show, and the old single grey line buried it. */}
        <p className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-bold text-white sm:text-4xl">{attended}</span>
          <span className="text-sm text-white/60">
            of {total} {total === 1 ? "meeting" : "meetings"}
            {total > 0 && ` · ${pct}%`}
          </span>
        </p>

        {total > 0 && (
          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Attendance for ${scopeLabel}`}
          >
            <div
              className="h-full rounded-full bg-brand-action transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {/* Membership progress is all-time and independent of the active tab,
            so it is labelled separately rather than folded into the bar above. */}
        {!stats.isMember && stats.threshold !== null && (
          <p className="mt-3 text-sm text-white/70">
            <span className="font-semibold text-white">{stats.remaining} more</span>{" "}
            {stats.remaining === 1 ? "meeting" : "meetings"} to become a member
            <span className="text-white/50">
              {" "}
              ({stats.attendedAllTime}/{stats.threshold} all time)
            </span>
          </p>
        )}
      </header>

      <TermTabs terms={stats.terms} activeScope={scope} onSelect={onSelectScope} />

      {/* On a phone the viewport is already short, so a nested 60vh scroller
          leaves a cramped window inside a scrollable page. Let the list flow
          with the page on mobile and cap it only once there's height to spare. */}
      <div
        className={`pr-1 md:max-h-[60vh] md:overflow-y-auto ${pending ? "opacity-60" : ""}`}
      >
        <MeetingsList meetings={items} emptyMessage={emptyMessage} />
        {page.hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={pending}
            className="mt-4 w-full rounded-full border border-white/25 bg-white/5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none disabled:opacity-50"
          >
            {pending ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </section>
  );
}

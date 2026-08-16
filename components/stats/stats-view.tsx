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
  const attended = scope === "all" ? stats.attendedAllTime : activeTerm?.attended ?? 0;
  const total = scope === "all" ? stats.totalAllTime : activeTerm?.total ?? 0;
  const pct = percentage(attended, total);

  const countLabel = stats.isMember
    ? `${attended} of ${total} meetings attended (${pct}%)`
    : stats.threshold !== null
      ? `${stats.attendedAllTime} of ${stats.threshold} meetings — ${stats.remaining} more to become a member`
      : `${stats.attendedAllTime} meetings attended`;

  const emptyMessage =
    view === "attended"
      ? `No meetings attended yet. Check in at the next ${name} event!`
      : view === "missed"
        ? "No missed meetings here."
        : "No club meetings yet. Check back soon!";

  return (
    <section className="flex flex-1 flex-col gap-5 px-4 py-8 sm:px-6 md:gap-6 md:px-10 md:py-12">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-primary">
            Your Activity
          </p>
          <MembershipBadge isMember={stats.isMember} orgName={name} role={stats.role} />
          <ViewToggle value={view} onChange={onChangeView} />
        </div>
        <h1 className="text-xl font-bold text-white sm:text-2xl md:text-3xl">
          Your Attendance
        </h1>
        <p className="text-sm text-white/60">{countLabel}</p>
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
            className="mt-4 w-full rounded-full border border-white/25 bg-white/5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {pending ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </section>
  );
}

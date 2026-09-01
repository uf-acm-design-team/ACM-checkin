"use client";

import { useEffect, useRef, useState, useTransition } from "react";

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
import { Meter } from "@/components/ui/primitives";

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

  // Re-sync when the server hands down genuinely new data.
  //
  // The useState calls above only run their initializers on MOUNT. On a soft
  // navigation back to this route, or a router.refresh() after a check-in, the
  // server sends a fresh initialPage but the component stays mounted -- so it
  // kept rendering the list it was already holding and the page looked frozen
  // at its pre-check-in state.
  //
  // The dependency is a SIGNATURE of the server payload, not initialPage
  // itself: that prop is a new object on every server render, so depending on
  // it would re-run this on renders where nothing actually changed and yank a
  // user out of the term/view they had picked. Comparing content means the
  // reset happens only when the server's answer really did change.
  //
  // Bumping requestId also cancels any in-flight refetch, so a response for
  // the pre-refresh scope/view cannot land afterwards and re-stale the list.
  const serverSignature = `${initialScope}|${initialPage.total}|${initialPage.items
    .map((m) => m.id)
    .join(",")}`;
  const lastSignature = useRef(serverSignature);
  useEffect(() => {
    if (lastSignature.current === serverSignature) return;
    lastSignature.current = serverSignature;
    requestId.current++;
    setScope(initialScope);
    setView("attended");
    setPage(initialPage);
    setItems(initialPage.items);
    // initialScope/initialPage are read through the signature they produce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSignature]);

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

  // The empty state is almost always a filter, not an absence -- so it names
  // the filter that produced it and points at the way out.
  const emptyTitle =
    view === "attended"
      ? `Nothing in ${scopeLabel} yet`
      : view === "missed"
        ? "No missed meetings"
        : `No meetings in ${scopeLabel}`;

  const emptyMessage =
    view === "attended"
      ? `Check in at the next ${name} event and it shows up here. Your other terms are still there — switch terms above.`
      : view === "missed"
        ? "You haven't missed a meeting in this term."
        : "No club meetings have been held in this term yet.";

  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 py-5 sm:px-6 md:max-w-3xl">
      {/*
        The membership card. The one inverted surface on this page: it is the
        answer to the question someone opened stats to ask, so it gets the
        accent field while everything below it stays neutral.
      */}
      <div className="flex flex-col gap-3 rounded-panel bg-accent-deep p-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-white/75">Membership</span>
          <MembershipBadge
            isMember={stats.isMember}
            orgName={name}
            role={stats.role}
            onAccent
          />
        </div>

        <p className="m-0 text-[30px] font-bold tracking-[-0.02em] tabular-nums">
          {attended} {attended === 1 ? "meeting" : "meetings"}
        </p>

        {total > 0 && (
          <Meter
            value={attended}
            max={total}
            tone="inverted"
            label={`Attendance for ${scopeLabel}`}
          />
        )}

        {/* Membership progress is all-time and independent of the active tab,
            so it is stated separately rather than folded into the bar above. */}
        <p className="m-0 text-[13px] text-white/75">
          {stats.isMember ? (
            <>
              Threshold met
              {stats.threshold !== null &&
                ` — ${stats.attendedAllTime} of ${stats.threshold} all time`}
            </>
          ) : stats.threshold !== null ? (
            <>
              {stats.remaining} more{" "}
              {stats.remaining === 1 ? "meeting" : "meetings"} to become a member
              ({stats.attendedAllTime}/{stats.threshold} all time)
            </>
          ) : (
            <>
              {total > 0
                ? `${pct}% of ${total} ${total === 1 ? "meeting" : "meetings"} in ${scopeLabel}`
                : `No meetings in ${scopeLabel} yet`}
            </>
          )}
        </p>
      </div>

      <TermTabs terms={stats.terms} activeScope={scope} onSelect={onSelectScope} />

      {/* The view switch sits on a hairline directly above the list it filters,
          which is what makes the counts legible as "what you'd see if you
          tapped this". */}
      <div className="border-b border-line">
        <ViewToggle
          value={view}
          counts={{ attended, missed: Math.max(0, total - attended), all: total }}
          onChange={onChangeView}
        />
      </div>

      <div className={pending ? "opacity-60" : undefined}>
        <MeetingsList
          meetings={items}
          emptyTitle={emptyTitle}
          emptyMessage={emptyMessage}
        />
        {page.hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={pending}
            className="mt-3 w-full cursor-pointer rounded-control border border-line bg-surface py-2.5 text-sm font-semibold text-ink-strong transition-colors hover:bg-surface-sunken disabled:opacity-50"
          >
            {pending ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </section>
  );
}

"use client";

import React from "react";
import {
  CenteredScreen,
  GhostButton,
  MeetingStrip,
  Notice,
  PrimaryButton,
  Skeleton,
} from "./shell";
import { Eyebrow, Meter, Spinner } from "@/components/ui/primitives";

/** State 1 — a spinner over a skeleton in the shape of the form, not a blank page. */
export function LoadingState() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-var(--org-nav-h))] w-full max-w-md flex-col bg-surface">
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <Spinner />
        <p className="m-0 text-sm text-ink-faint">Finding today&apos;s meeting…</p>
      </div>
      <div className="flex flex-col gap-2.5 px-6 pb-8">
        <Skeleton h={14} w="60%" />
        <Skeleton h={48} />
      </div>
      <span className="sr-only" role="status">
        Loading check-in
      </span>
    </div>
  );
}

/**
 * State 2 — arrived early. The wireframe treats this as a real screen, not a
 * dead end: it says when check-in opens, what's next, and that the page will
 * become the form on its own.
 */
export function NoActiveMeetingState({
  opensIn,
  next,
  onAbout,
}: {
  opensIn?: string;
  next?: { title: string; when: string; where?: string };
  onAbout?: () => void;
}) {
  return (
    <CenteredScreen>
      {/* The neutral clock tile -- this is an empty state, not a failure, so it
          stays grey rather than borrowing a semantic tone. */}
      <span
        aria-hidden="true"
        className="flex size-13 items-center justify-center rounded-lg bg-surface-sunken text-[22px] text-ink-faint"
      >
        ◷
      </span>

      <h1 className="m-0 text-2xl font-bold tracking-[-0.02em] text-ink text-pretty">
        Check-in isn&apos;t open yet
      </h1>

      <p className="m-0 text-[15px] leading-relaxed text-ink-muted text-pretty">
        {next ? (
          <>
            The next meeting is{" "}
            <strong className="font-semibold text-ink">{next.title}</strong>,{" "}
            {next.when}
            {next.where && ` in ${next.where}`}. Officers open check-in when it
            starts.
          </>
        ) : (
          <>
            Keep this page open — it turns into the check-in form by itself the
            moment an officer opens the meeting.
          </>
        )}
      </p>

      {/* The countdown gets its own boxed row: it's the one number someone who
          arrived early actually wants. */}
      {opensIn && (
        <div className="mt-1.5 flex items-center justify-between rounded-card border border-line px-4 py-3.5">
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] text-ink-faint">Opens</span>
            <span className="text-[19px] font-bold text-ink tabular-nums">
              {opensIn}
            </span>
          </span>
          <span className="rounded-sm bg-accent-soft px-2.5 py-1.5 font-mono text-[11px] font-semibold text-accent-on-soft">
            EST
          </span>
        </div>
      )}

      {onAbout && (
        <div className="mt-2">
          <GhostButton onClick={onAbout}>View org page</GhostButton>
        </div>
      )}
    </CenteredScreen>
  );
}

/**
 * The last thing most guests ever see.
 *
 * The one inverted screen in the app: a solid accent field, white type. It has
 * to be readable at a glance, in a crowd, at arm's length -- which is exactly
 * what an all-white card is bad at. Leads with the name, confirms the meeting,
 * and shows membership progress, the one thing a member came for.
 */
export function SuccessState({
  firstName,
  meetingTitle,
  where,
  at,
  membership,
  orgName,
  onStats,
}: {
  firstName?: string;
  meetingTitle: string;
  where?: string;
  at?: string;
  membership?: { attended: number; threshold: number };
  orgName: string;
  onStats?: () => void;
}) {
  const met = membership != null && membership.attended >= membership.threshold;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-var(--org-nav-h))] w-full max-w-md flex-col bg-accent-deep text-white">
      <div className="flex flex-1 flex-col justify-center gap-4 px-7">
        <span
          aria-hidden="true"
          className="flex size-16.5 items-center justify-center rounded-full bg-white text-[32px] font-bold text-accent-deep"
        >
          ✓
        </span>

        <h1 className="m-0 text-[38px] font-bold leading-[1.05] tracking-[-0.03em]">
          You&apos;re checked in
        </h1>

        <p className="m-0 text-base leading-relaxed text-white/78">
          {[firstName, meetingTitle, at].filter(Boolean).join(" · ")}
          {where && ` · ${where}`}
        </p>

        {membership && (
          <div className="flex flex-col gap-3 rounded-card bg-white/12 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] text-white/70">
                  Membership progress
                </span>
                <span className="text-[17px] font-bold">
                  {membership.attended} of {membership.threshold} meetings
                </span>
              </span>
              {met && (
                <span className="rounded-md bg-white px-2.5 py-1.5 text-xs font-bold text-accent-deep">
                  MEMBER
                </span>
              )}
            </div>
            <Meter
              value={membership.attended}
              max={membership.threshold}
              tone="inverted"
            />
            {!met && (
              <p className="m-0 text-[13px] text-white/70">
                {membership.threshold - membership.attended} more{" "}
                {membership.threshold - membership.attended === 1
                  ? "meeting"
                  : "meetings"}{" "}
                to become a member of {orgName}.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5 px-7 pt-6 pb-10">
        {onStats && (
          <button
            onClick={onStats}
            className="w-full rounded-control bg-white px-4 py-4 text-sm font-semibold text-accent-deep transition-colors hover:bg-white/90"
          >
            See your stats
          </button>
        )}
        <p className="m-0 text-center text-sm text-white/72">
          Done — you can put your phone away
        </p>
      </div>
    </div>
  );
}

/** State 11 — reassurance, not an error. */
export function AlreadyCheckedInState({
  meetingTitle,
  at,
  onStats,
}: {
  meetingTitle: string;
  at?: string;
  onStats?: () => void;
}) {
  return (
    <CenteredScreen>
      <div className="flex flex-col gap-2.5 rounded-panel border border-good-line bg-good-surface p-6">
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-lg bg-good text-xl text-white"
        >
          ✓
        </span>
        <p className="m-0 text-[21px] font-bold text-good-ink">
          Already checked in
        </p>
        <p className="m-0 text-[14.5px] leading-relaxed text-ink-muted">
          We logged you{at ? ` at ${at}` : ""} for {meetingTitle}. No need to do
          it twice.
        </p>
        {onStats && (
          <button
            onClick={onStats}
            className="mt-1 w-full rounded-control border border-good-line bg-surface px-4 py-3 text-sm font-semibold text-good-ink transition-colors hover:bg-good-surface"
          >
            View my stats
          </button>
        )}
      </div>
    </CenteredScreen>
  );
}

/**
 * State 8 — too far. The wireframe's insight: lead with the actionable number,
 * not with "you failed a check".
 */
export function TooFarState({
  metresAway,
  radius,
  where,
  onRetry,
  onAskOfficer,
  busy,
}: {
  metresAway: number;
  radius: number;
  where?: string;
  onRetry: () => void;
  onAskOfficer?: () => void;
  busy?: boolean;
}) {
  return (
    <CenteredScreen>
      <Notice
        tone="warn"
        eyebrow="Too far"
        title={`Move about ${metresAway} m closer`}
      >
        You need to be within {radius} m of {where ?? "the meeting"}. Walk in and
        try again — nothing you typed is lost.
      </Notice>
      <div className="flex gap-2">
        <button
          onClick={onRetry}
          disabled={busy}
          className="flex-1 rounded-control bg-warn-ink px-4 py-3 text-sm font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-55"
        >
          {busy ? "Checking…" : "Try again"}
        </button>
        {onAskOfficer && (
          <button
            onClick={onAskOfficer}
            className="rounded-control border border-warn-line bg-surface px-4 py-3 text-sm font-semibold text-warn-ink transition-colors hover:bg-warn-surface"
          >
            Ask an officer
          </button>
        )}
      </div>
    </CenteredScreen>
  );
}

/** State 9 — a dead end made recoverable, with real per-platform steps. */
export function LocationDeniedState({
  onRetry,
  onAskOfficer,
  busy,
}: {
  onRetry: () => void;
  onAskOfficer?: () => void;
  busy?: boolean;
}) {
  const steps = [
    <>
      Tap the <b>AA</b> icon in the address bar
    </>,
    <>
      Website Settings → Location → <b>Allow</b>
    </>,
    <>Come back and tap Try again</>,
  ];

  return (
    <CenteredScreen>
      <Notice
        tone="bad"
        eyebrow="Denied"
        title="Location permission is off"
      >
        Enable it in Settings → Safari → Location, or ask an officer to check you
        in manually.
      </Notice>

      <div className="flex flex-col gap-2.5 rounded-card border border-line p-4">
        <Eyebrow>To fix it on iOS</Eyebrow>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {steps.map((s, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-strong"
            >
              <span className="mt-px shrink-0 font-mono text-[10.5px] font-semibold text-ink-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="m-0 text-[13px] leading-relaxed text-ink-muted">
        Not comfortable sharing it? That&apos;s fine — an officer can add you by
        name in under ten seconds.
      </p>

      <div className="flex flex-col gap-2.5">
        <PrimaryButton onClick={onRetry} disabled={busy}>
          {busy ? "Checking…" : "Try again"}
        </PrimaryButton>
        {onAskOfficer && (
          <GhostButton onClick={onAskOfficer}>
            Show my name to an officer
          </GhostButton>
        )}
      </div>
    </CenteredScreen>
  );
}

/**
 * State 6 — explain the location ask BEFORE the browser prompt fires, so the
 * permission dialog isn't the first thing a guest sees.
 */
export function LocationAskState({
  radius,
  where,
  onShare,
  onAskOfficer,
  busy,
}: {
  radius: number;
  where?: string;
  onShare: () => void;
  onAskOfficer?: () => void;
  busy?: boolean;
}) {
  return (
    <CenteredScreen>
      <div className="flex flex-col gap-2.5 rounded-card border border-line p-5">
        <Eyebrow>Permission request</Eyebrow>
        <p className="m-0 text-[17px] font-bold text-ink">
          This meeting is location-locked
        </p>
        <p className="m-0 text-sm leading-relaxed text-ink-muted">
          Officers set a {radius} m radius{where ? ` around ${where}` : ""}. We
          check once, at check-in. Nothing is stored beyond pass/fail.
        </p>
        <div className="mt-1 flex gap-2">
          <PrimaryButton onClick={onShare} disabled={busy} className="flex-1">
            {busy ? "Checking…" : "Share location"}
          </PrimaryButton>
          {onAskOfficer && (
            <button
              onClick={onAskOfficer}
              className="rounded-control border border-line px-4 py-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-sunken"
            >
              Not now
            </button>
          )}
        </div>
      </div>
      <p className="m-0 text-[13px] leading-relaxed text-ink-muted">
        Your browser will ask next. If you&apos;d rather not share it, an officer
        can check you in manually from the Attendance tab.
      </p>
    </CenteredScreen>
  );
}

/** Shown while the geolocation fix is being taken. */
export function LocationCheckingState() {
  return (
    <CenteredScreen>
      <div className="flex items-center gap-3.5 rounded-card border border-line p-5">
        <Spinner size={26} />
        <span className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-ink">
            Checking your location…
          </span>
          <span className="text-[13px] text-ink-faint">
            Usually under 3 seconds
          </span>
        </span>
      </div>
    </CenteredScreen>
  );
}

/**
 * State 12 — says what actually failed. This is the state the old build showed
 * as "Club does not exist": a network failure wearing a wrong-club message.
 */
export function NetworkErrorState({
  detail,
  // Not named `ref`: React reserves that prop, so it would never arrive here.
  reference,
  onRetry,
  busy,
}: {
  detail?: string;
  reference?: string;
  onRetry: () => void;
  busy?: boolean;
}) {
  return (
    <CenteredScreen>
      <div className="flex flex-col gap-2.5 rounded-panel border border-bad-line bg-bad-surface p-6">
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-lg bg-bad text-xl font-bold text-white"
        >
          !
        </span>
        <p className="m-0 text-[21px] font-bold text-bad-ink">
          We couldn&apos;t reach the server
        </p>
        <p className="m-0 text-[14.5px] leading-relaxed text-ink-muted">
          Campus wifi drops hard when thirty people join at once. Your answers
          are saved on this device — this is a connection problem, not a check-in
          problem.
        </p>
        <div className="mt-1">
          <button
            onClick={onRetry}
            disabled={busy}
            className="w-full rounded-control bg-bad px-4 py-3 text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:opacity-55"
          >
            {busy ? "Retrying…" : "Retry"}
          </button>
        </div>
      </div>

      {(detail || reference) && (
        <div className="flex flex-col gap-1 rounded-card border border-line px-4 py-3">
          <Eyebrow>For an officer</Eyebrow>
          {detail && (
            <p className="m-0 font-mono text-[11px] text-ink-muted">{detail}</p>
          )}
          {reference && (
            <p className="m-0 font-mono text-[11px] text-ink-faint">
              ref {reference}
            </p>
          )}
        </div>
      )}
    </CenteredScreen>
  );
}

/** Org-not-found — a real 404, stated as such, distinct from state 12. */
export function OrgNotFoundState({ slug }: { slug: string }) {
  return (
    <CenteredScreen>
      <div className="flex flex-col gap-2 rounded-panel border border-line p-6">
        <Eyebrow>Org not found</Eyebrow>
        <p className="m-0 text-[17px] font-bold text-ink">No org at /{slug}</p>
        <p className="m-0 text-[13.5px] leading-relaxed text-ink-muted">
          Check the link or scan the QR again. If you got here from a poster,
          tell an officer the slug is wrong. This is a real 404 — we reached the
          server and it had no such club.
        </p>
      </div>
    </CenteredScreen>
  );
}

export { MeetingStrip };

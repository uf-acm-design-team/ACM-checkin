"use client";

import React from "react";
import {
  CheckinCard,
  Eyebrow,
  GhostButton,
  MeetingStrip,
  Notice,
  PrimaryButton,
  Skeleton,
  ink,
} from "./shell";

/** State 1 — a skeleton in the shape of the form, not a spinner. */
export function LoadingState() {
  return (
    <CheckinCard>
      <div className="flex flex-col gap-2 rounded-[var(--radius-card)] px-4 py-3" style={{ background: ink(8) }}>
        <Skeleton h={11} w="34%" />
        <Skeleton h={18} w="72%" />
        <Skeleton h={11} w="56%" />
      </div>
      <div className="flex flex-col gap-2.5">
        <Skeleton h={11} w="30%" />
        <Skeleton h={52} />
      </div>
      <div className="mt-auto flex flex-col gap-2.5">
        <Skeleton h={56} />
      </div>
      <span className="sr-only" role="status">
        Loading check-in
      </span>
    </CheckinCard>
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
    <CheckinCard>
      <div className="flex flex-col gap-2">
        <Eyebrow>Nothing open right now</Eyebrow>
        <p className="m-0 text-[24px] font-extrabold leading-tight">
          {opensIn ? (
            <>
              Check-in opens
              <br />
              <span style={{ color: "var(--brand-action)" }}>{opensIn}</span>.
            </>
          ) : (
            <>No meeting is open yet.</>
          )}
        </p>
      </div>

      {next && (
        <div className="flex flex-col gap-2">
          <Eyebrow>Next up</Eyebrow>
          <MeetingStrip title={next.title} when={next.when} where={next.where} />
        </div>
      )}

      <p className="m-0 text-[13px] leading-relaxed" style={{ color: ink(70) }}>
        Keep this page open — it will turn into the check-in form by itself the
        moment an officer opens the meeting.
      </p>

      {onAbout && (
        <div className="mt-auto">
          <GhostButton onClick={onAbout}>About this club</GhostButton>
        </div>
      )}
    </CheckinCard>
  );
}

/**
 * The last thing most guests ever see. Leads with the name, confirms the
 * meeting, and shows membership progress -- the one thing a member came for.
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
  const met =
    membership != null && membership.attended >= membership.threshold;

  return (
    <CheckinCard>
      <Eyebrow tone="live">
        Checked in{at ? ` · ${at}` : ""}
      </Eyebrow>

      <p className="m-0 text-[40px] font-extrabold leading-[1.05]">
        You&apos;re in{firstName ? "," : "."}
        {firstName && (
          <>
            <br />
            {firstName}.
          </>
        )}
      </p>

      <p className="m-0 text-[14px] leading-relaxed" style={{ color: ink(70) }}>
        {meetingTitle}
        {where && ` · ${where}`}
      </p>

      {membership && (
        <div
          className="flex flex-col gap-2 rounded-[var(--radius-card)] px-4 py-3.5"
          style={{ background: ink(8), border: `1px solid ${ink(14)}` }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <Eyebrow>Membership</Eyebrow>
            <span className="font-mono text-[15px] font-semibold">
              {membership.attended} / {membership.threshold}
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)]"
            style={{ background: ink(15) }}
          >
            <div
              className="h-full rounded-[var(--radius-pill)]"
              style={{
                width: `${Math.min(100, (membership.attended / Math.max(1, membership.threshold)) * 100)}%`,
                background: "var(--brand-action)",
              }}
            />
          </div>
          <p className="m-0 text-[13px] leading-relaxed" style={{ color: ink(72) }}>
            {met
              ? `Threshold met — you're a member of ${orgName}.`
              : `${membership.threshold - membership.attended} more ${
                  membership.threshold - membership.attended === 1
                    ? "meeting"
                    : "meetings"
                } and you're a member of ${orgName}.`}
          </p>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2.5">
        {onStats && <PrimaryButton onClick={onStats}>See your stats</PrimaryButton>}
        <p
          className="m-0 text-center text-[12.5px]"
          style={{ color: ink(50) }}
        >
          Done — you can close this
        </p>
      </div>
    </CheckinCard>
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
    <CheckinCard>
      <Eyebrow tone="live">Already in{at ? ` · ${at}` : ""}</Eyebrow>
      <p className="m-0 text-[40px] font-extrabold leading-[1.05]">
        You&apos;re
        <br />
        already in.
      </p>
      <p className="m-0 text-[14px] leading-relaxed" style={{ color: ink(72) }}>
        You&apos;re already checked in for {meetingTitle}. Nothing else to do.
      </p>
      {onStats && (
        <div className="mt-auto">
          <PrimaryButton onClick={onStats}>See your stats</PrimaryButton>
        </div>
      )}
    </CheckinCard>
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
    <CheckinCard>
      <Eyebrow tone="warn">Too far to check in</Eyebrow>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[52px] font-extrabold leading-none">
          {metresAway}
        </span>
        <span className="text-[20px] font-semibold" style={{ color: ink(60) }}>
          m
        </span>
      </div>
      <p className="m-0 text-[16px] font-semibold leading-snug">
        Move about {metresAway} m closer, then tap again.
      </p>
      <p className="m-0 text-[13px] leading-relaxed" style={{ color: ink(70) }}>
        {where ? `The meeting is at ${where}. ` : ""}You need to be within{" "}
        {radius} m of it.
      </p>
      <div className="mt-auto flex flex-col gap-2.5">
        <PrimaryButton onClick={onRetry} disabled={busy}>
          {busy ? "Checking…" : "Try again"}
        </PrimaryButton>
        {onAskOfficer && (
          <GhostButton onClick={onAskOfficer}>Ask an officer instead</GhostButton>
        )}
      </div>
    </CheckinCard>
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
    <CheckinCard>
      <Eyebrow tone="warn">Location blocked</Eyebrow>
      <p className="m-0 text-[24px] font-extrabold leading-tight">
        Your browser is holding location back.
      </p>

      <div className="flex flex-col gap-2">
        <Eyebrow>To fix it on iOS</Eyebrow>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
              <span
                className="mt-px shrink-0 font-mono text-[10.5px] font-semibold"
                style={{ color: ink(45) }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="m-0 text-[13px] leading-relaxed" style={{ color: ink(70) }}>
        Not comfortable sharing it? That&apos;s fine — an officer can add you by
        name in under ten seconds.
      </p>

      <div className="mt-auto flex flex-col gap-2.5">
        <PrimaryButton onClick={onRetry} disabled={busy}>
          {busy ? "Checking…" : "Try again"}
        </PrimaryButton>
        {onAskOfficer && (
          <GhostButton onClick={onAskOfficer}>
            Show my name to an officer
          </GhostButton>
        )}
      </div>
    </CheckinCard>
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
    <CheckinCard>
      <Eyebrow>One more thing</Eyebrow>
      <p className="m-0 text-[24px] font-extrabold leading-tight">
        This meeting checks that you&apos;re in the room.
      </p>
      <p className="m-0 text-[13px] leading-relaxed" style={{ color: ink(72) }}>
        Officers set a {radius} m radius{where ? ` around ${where}` : ""}. We
        check your distance once and never store your coordinates.
      </p>
      <Notice tone="warn" eyebrow="Note">
        Your browser will ask next. If you&apos;d rather not share it, an officer
        can check you in manually from the Attendance tab.
      </Notice>
      <div className="mt-auto flex flex-col gap-2.5">
        <PrimaryButton onClick={onShare} disabled={busy}>
          {busy ? "Checking…" : "Share location & check in"}
        </PrimaryButton>
        {onAskOfficer && (
          <GhostButton onClick={onAskOfficer}>Ask an officer instead</GhostButton>
        )}
      </div>
    </CheckinCard>
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
    <CheckinCard>
      <Eyebrow tone="bad">Couldn&apos;t reach the server</Eyebrow>
      <p className="m-0 text-[24px] font-extrabold leading-tight">
        Your check-in didn&apos;t go through.
      </p>
      <p className="m-0 text-[13px] leading-relaxed" style={{ color: ink(72) }}>
        Campus wifi drops hard when thirty people join at once. Nothing you typed
        is lost — tap retry.
      </p>
      {(detail || reference) && (
        <div
          className="flex flex-col gap-1 rounded-[var(--radius-card)] px-4 py-3"
          style={{ background: ink(8), border: `1px solid ${ink(12)}` }}
        >
          <Eyebrow>For an officer</Eyebrow>
          {detail && (
            <p className="m-0 font-mono text-[11px]" style={{ color: ink(65) }}>
              {detail}
            </p>
          )}
          {reference && (
            <p className="m-0 font-mono text-[11px]" style={{ color: ink(50) }}>
              ref {reference}
            </p>
          )}
        </div>
      )}
      <div className="mt-auto">
        <PrimaryButton onClick={onRetry} disabled={busy}>
          {busy ? "Retrying…" : "Retry check-in"}
        </PrimaryButton>
      </div>
    </CheckinCard>
  );
}

/** Org-not-found — a real 404, stated as such, distinct from state 12. */
export function OrgNotFoundState({ slug }: { slug: string }) {
  return (
    <CheckinCard>
      <Eyebrow tone="bad">No club at this link</Eyebrow>
      <p className="m-0 text-[24px] font-extrabold leading-tight">
        There&apos;s no club called &ldquo;{slug}&rdquo;.
      </p>
      <p className="m-0 text-[13px] leading-relaxed" style={{ color: ink(72) }}>
        The link may be old, or the slug may have changed. This is a real 404 —
        we reached the server and it had no such club.
      </p>
    </CheckinCard>
  );
}

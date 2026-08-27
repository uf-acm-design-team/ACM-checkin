"use client";

import React from "react";

/**
 * The check-in card's furniture.
 *
 * Every state in the flow renders inside `CheckinCard`, under the same
 * `MeetingStrip`. That constancy is the point: a guest at the door always knows
 * which meeting they are checking into, and a state change (validating, wrong
 * password, too far away) never blanks the context out from under them.
 *
 * Colours resolve from the org's tokens -- `--surface-ink` is the derived
 * readable ink for the branded background, so a club that stores a light
 * background gets dark hairlines and muted text here instead of invisible
 * white-on-white ones.
 */

/** Hairline and muted-text alphas, mixed off --surface-ink so they flip with it. */
export const ink = (pct: number) =>
  `color-mix(in srgb, var(--surface-ink) ${pct}%, transparent)`;

export function CheckinCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-6 pt-4 sm:px-6">
      <div
        className="flex flex-1 flex-col gap-4 rounded-[var(--radius-phone)] p-5 backdrop-blur-md sm:p-6"
        style={{
          background: ink(10),
          border: `1px solid ${ink(18)}`,
          color: "var(--surface-ink)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Small uppercase mono label — the wireframe's 10.5px micro tier. */
export function Eyebrow({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "live" | "warn" | "bad";
}) {
  // These sit on the branded background, not on the action colour, so they
  // can't use --brand-action: an org whose accent is close to its background
  // (the default orange-on-blue included) renders it as unreadable tinted grey
  // at 10.5px. Live gets full-strength surface ink plus a dot carrying the
  // brand colour; the semantic tones stay fixed and light enough to read on a
  // dark surface.
  const color =
    tone === "live"
      ? "var(--surface-ink)"
      : tone === "warn"
        ? "#FCD34D"
        : tone === "bad"
          ? "#FCA5A5"
          : ink(55);
  return (
    <p
      className="m-0 flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em]"
      style={{ color }}
    >
      {tone === "live" && (
        <span
          aria-hidden="true"
          className="inline-block size-1.5 shrink-0 rounded-full"
          style={{ background: "var(--brand-action)" }}
        />
      )}
      {children}
    </p>
  );
}

/**
 * The constant context strip: which meeting, when, where, and whether check-in
 * is open. Present in every state including the error ones.
 */
export function MeetingStrip({
  title,
  when,
  where,
  status,
}: {
  title: string;
  when?: string;
  where?: string;
  status?: { label: string; tone?: "live" | "muted" | "warn" };
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-[var(--radius-card)] px-4 py-3"
      style={{ background: ink(8), border: `1px solid ${ink(12)}` }}
    >
      {status && (
        <Eyebrow tone={status.tone === "live" ? "live" : status.tone ?? "muted"}>
          {status.label}
        </Eyebrow>
      )}
      <h2 className="m-0 text-[18px] font-bold leading-tight wrap-break-word">
        {title}
      </h2>
      {(when || where) && (
        <p
          className="m-0 font-mono text-[11px] leading-relaxed"
          style={{ color: ink(60) }}
        >
          {when}
          {when && where && <span aria-hidden="true"> · </span>}
          {where}
        </p>
      )}
    </div>
  );
}

/**
 * The primary action. 56px min height (72px when `hero`) so it clears a thumb
 * target, and it always uses --brand-action with the derived --brand-action-ink
 * on top rather than assuming white text is readable.
 */
export function PrimaryButton({
  children,
  hero = false,
  ...props
}: { hero?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`w-full rounded-[var(--radius-control)] font-bold transition-opacity duration-150 disabled:opacity-55 ${
        hero ? "min-h-[72px] text-[18px]" : "min-h-[56px] text-[15px]"
      } ${props.className ?? ""}`}
      style={{
        background: "var(--brand-action)",
        color: "var(--brand-action-ink)",
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

/** Secondary action — the "ask an officer instead" escape hatch on error states. */
export function GhostButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`w-full rounded-[var(--radius-control)] px-4 py-3 text-[14px] font-semibold transition-opacity duration-150 disabled:opacity-55 ${props.className ?? ""}`}
      style={{
        background: "transparent",
        border: `1px solid ${ink(28)}`,
        color: "var(--surface-ink)",
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

/**
 * An error that sits directly above the button, where the thumb already is --
 * never in place of the form. Nothing typed is ever lost to a state change.
 */
export function Notice({
  tone = "bad",
  eyebrow,
  title,
  children,
}: {
  tone?: "bad" | "warn" | "good";
  eyebrow?: string;
  title?: string;
  children?: React.ReactNode;
}) {
  const accent =
    tone === "good" ? "#4ADE80" : tone === "warn" ? "#FBBF24" : "#FCA5A5";
  return (
    <div
      role={tone === "bad" ? "alert" : undefined}
      className="flex flex-col gap-1.5 rounded-[var(--radius-card)] px-4 py-3"
      style={{
        background: `color-mix(in srgb, ${accent} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 38%, transparent)`,
      }}
    >
      {eyebrow && (
        <p
          className="m-0 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: accent }}
        >
          {eyebrow}
        </p>
      )}
      {title && (
        <p className="m-0 text-[15px] font-semibold leading-snug">{title}</p>
      )}
      {children && (
        <div className="text-[13px] leading-relaxed" style={{ color: ink(75) }}>
          {children}
        </div>
      )}
    </div>
  );
}

/** Skeleton block — shaped like the form, so the page never looks broken. */
export function Skeleton({
  h,
  w = "100%",
  radius = "var(--radius-control)",
}: {
  h: number;
  w?: string;
  radius?: string;
}) {
  return (
    <div
      className="animate-pulse"
      style={{ height: h, width: w, borderRadius: radius, background: ink(12) }}
    />
  );
}

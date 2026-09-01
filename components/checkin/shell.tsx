import React from "react";
import { cn } from "@/lib/utils";
import { Chip, Eyebrow, buttonClass } from "@/components/ui/primitives";

/**
 * The check-in flow's furniture.
 *
 * Every state renders inside `CheckinScreen`, under the same `MeetingStrip`.
 * That constancy is the point: a guest at the door always knows which meeting
 * they are checking into, and a state change (validating, wrong password, too
 * far away) never blanks the context out from under them.
 *
 * This is the one route where the org's own accent is painted (see
 * app/[orgSlug]/checkin/layout.tsx), so `--accent` here is the club's colour,
 * not the product purple. Everything else -- the white surface, the slate text
 * ramp, the semantic tones -- is fixed, which is what keeps a club's palette
 * from making its own error states unreadable.
 */

/**
 * The full-height phone screen: a white column with a pinned footer action.
 *
 * The footer is separated by a hairline and sits outside the scroll region, so
 * a long question set scrolls under it rather than pushing the primary button
 * off the bottom of a phone.
 */
export function CheckinScreen({
  header,
  footer,
  children,
  className,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-var(--org-nav-h))] w-full max-w-md flex-col bg-surface">
      {header && <div className="flex flex-col gap-3.5 px-6 pt-4 pb-4">{header}</div>}
      <div className={cn("flex flex-1 flex-col gap-5 px-6", className)}>
        {children}
      </div>
      {footer && (
        <div className="mt-6 border-t border-line-soft px-6 pt-4 pb-8">{footer}</div>
      )}
    </div>
  );
}

/**
 * A centred single-message screen -- loading, empty, org-not-found.
 * Vertically centred in the space below the nav rather than the full viewport,
 * so the bar doesn't push it visually low.
 */
export function CenteredScreen({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-[calc(100dvh-var(--org-nav-h))] w-full max-w-md flex-col justify-center gap-4 bg-surface px-6 py-10",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The constant context strip: which meeting, when, where, and whether check-in
 * is open. Present in every state including the error ones.
 *
 * Rendered as plain type rather than a boxed card: on a white surface the
 * meeting title is the page's heading, and wrapping it in a second border
 * inside an already-bordered screen was noise.
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
  status?: { label: string; tone?: "good" | "neutral" | "warn" };
}) {
  const meta = [when, where].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="m-0 text-2xl font-bold tracking-[-0.02em] text-ink wrap-break-word">
        {title}
      </h1>
      <p className="m-0 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        {meta}
        {status && (
          <>
            {meta && <span aria-hidden="true">·</span>}
            <span
              className={cn(
                "font-medium",
                status.tone === "good"
                  ? "text-good"
                  : status.tone === "warn"
                    ? "text-warn-ink"
                    : "text-ink-muted",
              )}
            >
              {status.label}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

/**
 * The primary action. Full-width and tall enough to clear a thumb target, in
 * the org's accent with the derived readable ink on top -- never an assumed
 * white, which fails on a light accent.
 */
export function PrimaryButton({
  children,
  hero = false,
  className,
  ...props
}: { hero?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={buttonClass(
        "primary",
        "lg",
        cn("w-full", hero ? "py-5 text-base" : "", className),
      )}
    >
      {children}
    </button>
  );
}

/** Secondary action -- the "ask an officer instead" escape hatch on error states. */
export function GhostButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={buttonClass("secondary", "md", cn("w-full", className))}
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
  className,
}: {
  tone?: "bad" | "warn" | "good";
  eyebrow?: string;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const surface = {
    bad: "border-bad-line bg-bad-surface",
    warn: "border-warn-line bg-warn-surface",
    good: "border-good-line bg-good-surface",
  }[tone];
  const titleInk = {
    bad: "text-bad-ink",
    warn: "text-warn-ink",
    good: "text-good-ink",
  }[tone];

  return (
    <div
      role={tone === "bad" ? "alert" : undefined}
      className={cn(
        "flex flex-col gap-2 rounded-card border p-4",
        surface,
        className,
      )}
    >
      {eyebrow && <Eyebrow tone={tone}>{eyebrow}</Eyebrow>}
      {title && (
        <p className={cn("m-0 text-[15px] font-bold leading-snug", titleInk)}>
          {title}
        </p>
      )}
      {children && (
        <div className="text-[13.5px] leading-relaxed text-ink-muted">
          {children}
        </div>
      )}
    </div>
  );
}

/** Skeleton block -- shaped like the form, so the page never looks broken. */
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
      aria-hidden="true"
      style={{
        height: h,
        width: w,
        borderRadius: radius,
        background: "var(--surface-sunken)",
        animation: "pulse 1.4s ease-in-out infinite",
      }}
    />
  );
}

export { Chip, Eyebrow };

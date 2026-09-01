import React from "react";
import { cn } from "@/lib/utils";

/**
 * The shared component anatomy from the wireframes.
 *
 * The design's central claim is that public and admin are one system: a button
 * on the check-in card and a button in the officer console differ in density,
 * never in construction. So these primitives exist once and both surfaces use
 * them, rather than each route inventing its own padding and border.
 *
 * Everything here is a server component -- none of it holds state. Interactive
 * wrappers ("use client") compose these rather than re-implementing them.
 */

/* -------------------------------------------------------------------------
 * Buttons
 * ---------------------------------------------------------------------- */

type ButtonVariant =
  | "primary" // the accent. One per view -- that's the whole rule.
  | "secondary" // hairline box, slate label
  | "ghost" // no chrome until hover
  | "danger" // destructive confirm
  | "inverted"; // white on an accent/semantic field

type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-55";

const BUTTON_SIZES: Record<ButtonSize, string> = {
  // Compact: table rows and toolbars, where a full-height button would set the
  // row rhythm rather than follow it.
  sm: "px-3 py-2 text-[13px]",
  md: "px-4 py-3 text-sm",
  // The thumb target on the phone screens -- check-in's primary action.
  lg: "px-4 py-4 text-sm",
};

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink shadow-[var(--shadow-raised)] hover:bg-accent-deep",
  secondary:
    "border border-line bg-surface text-ink-strong font-semibold hover:bg-surface-sunken",
  ghost: "text-ink-muted font-semibold hover:bg-surface-sunken hover:text-ink",
  danger: "bg-bad text-white font-semibold hover:brightness-95",
  inverted:
    "bg-white text-accent-deep font-semibold shadow-[var(--shadow-raised)] hover:bg-white/90",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(BUTTON_BASE, BUTTON_SIZES[size], BUTTON_VARIANTS[variant], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  fullWidth,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  return (
    <button
      {...props}
      className={buttonClass(variant, size, cn(fullWidth && "w-full", className))}
    />
  );
}

/* -------------------------------------------------------------------------
 * Surfaces
 * ---------------------------------------------------------------------- */

/** The white card on the canvas. One elevation, one hairline. */
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "rounded-card border border-line bg-surface shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The dashed-outline placeholder used for "nothing here, and that may be
 * correct". Distinct from an error: the wireframe's empty states argue the
 * absence is usually a filter, not a failure, so they stay neutral and offer
 * the action that fills them.
 */
export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-card border border-dashed border-line px-6 py-8 text-center",
        className,
      )}
    >
      <p className="m-0 text-[17px] font-bold text-ink">{title}</p>
      {children && (
        <p className="m-0 max-w-sm text-sm leading-relaxed text-ink-muted text-pretty">
          {children}
        </p>
      )}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Labels and chips
 * ---------------------------------------------------------------------- */

/**
 * The uppercase mono micro-label. Used for state captions (OPEN, TOO FAR,
 * REQUIRED) and section eyebrows -- the wireframe's smallest type tier.
 */
type Tone = "neutral" | "accent" | "good" | "warn" | "bad";

const EYEBROW_TONES: Record<Tone, string> = {
  neutral: "text-ink-faint",
  accent: "text-accent",
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
};

export function Eyebrow({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "m-0 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase",
        EYEBROW_TONES[tone],
        className,
      )}
    >
      {children}
    </p>
  );
}

const CHIP_TONES: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-ink-muted",
  accent: "bg-accent-soft text-accent-on-soft",
  good: "bg-good-surface text-good-ink",
  warn: "bg-warn-surface text-warn-ink",
  bad: "bg-bad-surface text-bad-ink",
};

/**
 * The small status/flag pill: OPEN, GEO, PASSWORD, OFFICER, MEMBER.
 * Mono-cased so a row of them reads as a machine-set field rather than prose.
 */
export function Chip({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-1 font-mono text-[10px] font-bold tracking-[0.04em] uppercase",
        CHIP_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The identity tile -- an org crest or a person's initials. This is one of the
 * three jobs the accent is allowed to do, which is why it is a component and
 * not an ad-hoc div: it keeps "identity" visually distinct from "action".
 *
 * Pass `src` to render an uploaded logo; it falls back to `label` when the URL
 * is empty. Both cases live here on purpose -- when each call site rolled its
 * own crest-or-initial branch, some of them (the dashboard, the check-in
 * header) simply never checked for a logo and always drew the initial, so an
 * org that had uploaded a crest saw it in some places and not others.
 *
 * Uses a plain <img>, not next/image: these are remote Supabase storage URLs on
 * an arbitrary host, they are tiny and already sized by the surrounding layout,
 * and next/image would need per-host remotePatterns config to render them at
 * all.
 */
export function Identity({
  label,
  src,
  alt = "",
  size = "md",
  solid = false,
  className,
}: {
  label: string;
  /** Uploaded crest URL. Empty/absent falls back to the initial tile. */
  src?: string;
  /** Only set this when the tile is the sole carrier of the org's name. */
  alt?: string;
  size?: "sm" | "md" | "lg";
  /** Solid accent field instead of the soft tint -- for the primary org crest. */
  solid?: boolean;
  className?: string;
}) {
  const dims = {
    sm: "size-[30px] text-xs rounded-md",
    md: "size-10 text-sm rounded-md",
    lg: "size-[54px] text-xl rounded-lg",
  }[size];

  if (src && src.trim().length > 0) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={cn("flex-none bg-surface object-contain", dims, className)}
      />
    );
  }

  return (
    <span
      aria-hidden={alt ? undefined : "true"}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      className={cn(
        "inline-flex flex-none items-center justify-center font-mono font-semibold",
        dims,
        solid ? "bg-accent-deep text-white" : "bg-accent-soft text-accent-on-soft",
        className,
      )}
    >
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------
 * Notices
 * ---------------------------------------------------------------------- */

/**
 * A tinted, bordered block carrying a semantic state. The wireframe gives each
 * tone a matched surface/line/ink triple; passing a tone here is what keeps a
 * warning from being styled like an error somewhere else in the app.
 */
const NOTICE_TONES: Record<Exclude<Tone, "neutral" | "accent">, string> = {
  good: "border-good-line bg-good-surface",
  warn: "border-warn-line bg-warn-surface",
  bad: "border-bad-line bg-bad-surface",
};

const NOTICE_TITLE: Record<Exclude<Tone, "neutral" | "accent">, string> = {
  good: "text-good-ink",
  warn: "text-warn-ink",
  bad: "text-bad-ink",
};

export function Notice({
  tone,
  eyebrow,
  title,
  children,
  action,
  className,
}: {
  tone: "good" | "warn" | "bad";
  eyebrow?: string;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-card border p-4",
        NOTICE_TONES[tone],
        className,
      )}
    >
      {eyebrow && <Eyebrow tone={tone}>{eyebrow}</Eyebrow>}
      {title && (
        <p className={cn("m-0 text-[15px] font-bold", NOTICE_TITLE[tone])}>
          {title}
        </p>
      )}
      {children && (
        <div className="text-[13.5px] leading-relaxed text-ink-muted">
          {children}
        </div>
      )}
      {action && <div className="mt-1 flex gap-2">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Form furniture
 * ---------------------------------------------------------------------- */

export const FIELD_CLASS =
  "w-full rounded-control border border-line bg-surface px-4 py-3.5 text-ink placeholder:text-ink-faint transition-colors focus:border-accent focus:outline-none";

export function Label({
  className,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      {...props}
      className={cn("text-[13px] font-semibold text-ink-strong", className)}
    >
      {children}
    </label>
  );
}

/** Label + control + optional hint/error, with the spacing the wireframe uses. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  badge,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  /** e.g. the CONDITIONAL tag beside "Meeting password". */
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <div className="flex items-center gap-2">
          <Label htmlFor={htmlFor}>
            {label}
            {required && <span className="ml-1 text-bad">*</span>}
          </Label>
          {badge}
        </div>
      )}
      {children}
      {/* An error replaces the hint rather than stacking under it -- two lines
          of small print below a field is where people stop reading. */}
      {error ? (
        <p className="m-0 text-xs text-bad">{error}</p>
      ) : hint ? (
        <p className="m-0 text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Progress
 * ---------------------------------------------------------------------- */

/** The segmented step indicator on the guest flow. */
export function StepBar({ total, current }: { total: number; current: number }) {
  return (
    <div
      className="flex gap-1.5"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-label={`Step ${current} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1 flex-1 rounded-full",
            i < current ? "bg-accent" : "bg-line",
          )}
        />
      ))}
    </div>
  );
}

/** The membership meter. `tone="inverted"` for use on an accent field. */
export function Meter({
  value,
  max,
  tone = "default",
  className,
  label,
}: {
  value: number;
  max: number;
  tone?: "default" | "inverted";
  className?: string;
  /** Accessible name, when the surrounding copy doesn't already supply one. */
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={cn(
        "h-1.5 overflow-hidden rounded-full",
        tone === "inverted" ? "bg-white/25" : "bg-surface-sunken",
        className,
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div
        className={cn("h-full", tone === "inverted" ? "bg-white" : "bg-accent")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** The accent-ringed spinner used by every loading state. */
export function Spinner({
  size = 34,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block flex-none rounded-full", className)}
      style={{
        width: size,
        height: size,
        border: `3px solid var(--accent-soft)`,
        borderTopColor: "var(--accent)",
        animation: "spin 900ms linear infinite",
      }}
    />
  );
}

/** Pulsing placeholder bar for content that is still resolving. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block rounded bg-surface-sunken", className)}
      style={{ animation: "pulse 1.4s ease-in-out infinite" }}
    />
  );
}

/** Page/section heading pair. Keeps the type scale identical on both surfaces. */
export function PageHeading({
  title,
  meta,
  actions,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="m-0 text-[22px] font-bold tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {meta && <p className="m-0 text-[13px] text-ink-faint">{meta}</p>}
      </div>
      {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
    </div>
  );
}

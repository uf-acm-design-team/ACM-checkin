import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { buttonClass } from "@/components/ui/primitives";

/**
 * Landing (`/`) — a real entry page, not a redirector.
 *
 * Signed-in users still go straight to /dashboard. A signed-out visitor gets
 * this, and its job is to explain what the product does before asking for an
 * account. The route is public in proxy.ts, so this renders without a session.
 *
 * There is deliberately no club directory here. An attendee never needs one:
 * they arrive by scanning the QR on the slide or opening a link an officer sent,
 * both of which land directly on `/[orgSlug]/checkin`. A searchable list of every
 * org was answering a question nobody standing in a hallway actually has, and it
 * put a public roster of clubs on the front door for no one's benefit.
 *
 * Fully static: no data is read, so this is a plain server component.
 */

const HOW_IT_WORKS = [
  {
    title: "An officer opens the meeting",
    body: "They set the time and place, and optionally a password, a location lock, and any questions they want answered at the door.",
  },
  {
    title: "You scan the QR on the slide",
    body: "Guests give an email — no account, no app. Members who are signed in just tap once and they're in.",
  },
  {
    title: "Attendance counts toward membership",
    body: "Hit your club's threshold and you become a member automatically. Your progress lives on the Stats page.",
  },
];

const ATTENDEE_POINTS = [
  {
    title: "No account required",
    body: "An email is enough. First-timers add a name and grad year once, and never again.",
  },
  {
    title: "One tap once you're known",
    body: "Signed-in members see their name, the meeting, and a single button.",
  },
  {
    title: "Your record follows you",
    body: "Every club you check into shows up on one dashboard, with attendance and membership progress per term.",
  },
];

const OFFICER_POINTS = [
  {
    title: "Live roster as people arrive",
    body: "Check-ins stream in with names and timestamps. Export the whole thing to CSV before the meeting ends.",
  },
  {
    title: "Ask anything at the door",
    body: "Build a form from six question types — short and long text, multiple choice, checkboxes, dropdown, and a 1–5 scale.",
  },
  {
    title: "Keep it to the room",
    body: "Optional meeting password and a location lock with a radius you set. Officer-only meetings stay off the member list.",
  },
  {
    title: "Know who changed what",
    body: "An audit log records who opened a meeting, edited a geofence, or changed someone's role.",
  },
];

/** The three states a check-in can be in, drawn as the product draws them. */
function FlowPreview() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-5 shadow-[var(--shadow-card)]"
    >
      <p className="m-0 font-mono text-[10px] font-semibold tracking-[0.08em] text-ink-faint uppercase">
        General Body #4
      </p>
      <p className="m-0 text-xl font-bold tracking-[-0.02em] text-ink">
        Thu 6:00 PM · CSE E220
      </p>

      <div className="mt-1 flex flex-wrap gap-1.5">
        <span className="rounded-sm bg-good-surface px-2 py-1 font-mono text-[10px] font-bold tracking-[0.04em] text-good-ink uppercase">
          Open
        </span>
        <span className="rounded-sm bg-surface-sunken px-2 py-1 font-mono text-[10px] font-bold tracking-[0.04em] text-ink-muted uppercase">
          Geo
        </span>
        <span className="rounded-sm bg-surface-sunken px-2 py-1 font-mono text-[10px] font-bold tracking-[0.04em] text-ink-muted uppercase">
          Password
        </span>
      </div>

      <div className="mt-2 flex flex-col gap-2 border-t border-line-soft pt-4">
        {[
          ["Priya Raman", "6:04:12 PM", "member"],
          ["Jordan Reyes", "6:04:09 PM", "guest"],
          ["Alex Ntim", "6:04:01 PM", "member"],
        ].map(([name, time, kind]) => (
          <div key={name} className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-ink">{name}</span>
            <span className="font-mono text-[11px] text-ink-faint">
              {time} · {kind}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 border-t border-line-soft pt-4">
        <span className="text-[13px] text-ink-muted">Checked in tonight</span>
        <span className="text-[19px] font-bold text-ink tabular-nums">37</span>
      </div>
    </div>
  );
}

function PointList({ points }: { points: { title: string; body: string }[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {points.map((point) => (
        <li key={point.title} className="flex flex-col gap-1">
          <span className="text-[14px] font-bold text-ink">{point.title}</span>
          <span className="text-[13px] leading-relaxed text-ink-muted">
            {point.body}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="flex min-h-dvh flex-col text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <span className="text-[15px] font-bold tracking-[-0.02em]">
            Check-In
          </span>
          <nav className="flex items-center gap-2" aria-label="Account">
            <Link href="/sign-in" className={buttonClass("ghost", "sm")}>
              Sign in
            </Link>
            <Link href="/sign-up" className={buttonClass("primary", "sm")}>
              Create an account
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero. The preview sits beside the pitch so the first screen shows
            the actual product rather than describing it. */}
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 pt-12 pb-14 sm:px-6 sm:pt-16 lg:flex-row lg:items-center lg:gap-16">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <p className="m-0 font-mono text-[10.5px] font-semibold tracking-[0.08em] text-ink-faint uppercase">
              Attendance for student orgs
            </p>
            <h1 className="m-0 text-[40px] leading-[1.03] font-bold tracking-[-0.03em] text-balance sm:text-[52px]">
              Fifteen seconds at the door.
            </h1>
            <p className="m-0 max-w-lg text-[15px] leading-relaxed text-ink-muted text-pretty">
              Guests check in with an email and no account. Officers get the
              roster, the answers and the CSV before the meeting ends.
            </p>

            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <Link href="/sign-up" className={buttonClass("primary", "md")}>
                Create an account
              </Link>
              <Link href="/sign-in" className={buttonClass("secondary", "md")}>
                Sign in
              </Link>
            </div>

            <p className="m-0 text-[12.5px] leading-relaxed text-ink-faint">
              Checking in at a meeting? Scan the QR on the slide — you don&apos;t
              need an account for that.
            </p>
          </div>

          <div className="w-full lg:max-w-sm">
            <FlowPreview />
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
            <h2 className="m-0 text-[26px] font-bold tracking-[-0.02em] text-ink">
              How it works
            </h2>
            <ol className="m-0 mt-8 grid list-none gap-8 p-0 sm:grid-cols-3 sm:gap-6">
              {HOW_IT_WORKS.map((step, i) => (
                <li key={step.title} className="flex flex-col gap-2">
                  <span
                    aria-hidden="true"
                    className="font-mono text-[10.5px] font-semibold text-accent"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[15px] font-bold text-ink">
                    {step.title}
                  </span>
                  <span className="text-[13px] leading-relaxed text-ink-muted">
                    {step.body}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* The two audiences. Split because they want opposite things: an
            attendee wants to be done, an officer wants the data. */}
        <section className="mx-auto grid w-full max-w-5xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <p className="m-0 font-mono text-[10px] font-semibold tracking-[0.08em] text-ink-faint uppercase">
                For attendees
              </p>
              <h2 className="m-0 text-[22px] font-bold tracking-[-0.02em] text-ink">
                Check in and get on with the meeting
              </h2>
            </div>
            <PointList points={ATTENDEE_POINTS} />
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <p className="m-0 font-mono text-[10px] font-semibold tracking-[0.08em] text-accent uppercase">
                For officers
              </p>
              <h2 className="m-0 text-[22px] font-bold tracking-[-0.02em] text-ink">
                Run the room, keep the record
              </h2>
            </div>
            <PointList points={OFFICER_POINTS} />
          </div>
        </section>

        {/* Closing CTA. The one inverted band on the page. */}
        <section className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
            <div className="flex flex-col items-start gap-5 rounded-panel bg-accent-deep p-8 text-white sm:p-10">
              <h2 className="m-0 max-w-xl text-[28px] leading-[1.15] font-bold tracking-[-0.02em] text-balance">
                Run a club? Get your first meeting counting tonight.
              </h2>
              <p className="m-0 max-w-lg text-[15px] leading-relaxed text-white/78 text-pretty">
                Create an account, and an admin will set your org up with your
                own check-in link, branding and officer roles.
              </p>
              <Link
                href="/sign-up"
                className="rounded-control bg-white px-5 py-3 text-sm font-semibold text-accent-deep transition-colors hover:bg-white/90"
              >
                Create an account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-[12px] text-ink-faint sm:px-6">
          <span>Built by the ACM at UF design team</span>
          <span className="flex items-center gap-4">
            <Link href="/sign-in" className="hover:text-ink-muted">
              Sign in
            </Link>
            <Link href="/sign-up" className="hover:text-ink-muted">
              Create an account
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "./utils/supabase/client";
import ClubFinder, { type ClubOption } from "./club-finder";

/**
 * Landing (`/`) — a real entry page, not a redirector.
 *
 * Signed-in users still go straight to /dashboard. A signed-out visitor gets
 * this, and its one job is **find your club**: that's how someone who scanned a
 * poster rather than a QR code arrives. The route is public in proxy.ts, so
 * this renders without a session.
 *
 * Server component: the org list is a public read (branding/orgs are readable
 * by anon, same as OrgTheme), so the list ships with the HTML and a visitor on
 * hall wifi sees clubs without waiting on a client fetch.
 */

const HOW_IT_WORKS = [
  {
    title: "An officer opens the meeting",
    body: "Optional password, geofence, and any questions they want to ask.",
  },
  {
    title: "You scan the QR on the slide",
    body: "Email, done. Members tap one button.",
  },
  {
    title: "Attendance counts toward membership",
    body: "A few meetings makes you a member. Your progress lives on the Stats page.",
  },
];

async function loadClubs(): Promise<ClubOption[]> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("organizations")
      .select("slug, name")
      .not("slug", "is", null)
      .order("name", { ascending: true });

    return (data ?? [])
      .filter((o): o is ClubOption => Boolean(o.slug && o.name))
      .map((o) => ({ slug: o.slug, name: o.name }));
  } catch {
    // The directory is a convenience, not the point of the page -- a failed
    // read must still leave the sign-in and check-in paths reachable.
    return [];
  }
}

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  const clubs = await loadClubs();

  return (
    <div className="flex min-h-dvh flex-col text-white">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
        <span className="text-[15px] font-extrabold tracking-tight">
          Check-In
        </span>
        <nav className="flex items-center gap-2" aria-label="Account">
          <Link
            href="/sign-in"
            className="rounded-[var(--radius-control)] px-3 py-2 text-[13px] font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none sm:px-4"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-[var(--radius-control)] px-3 py-2 text-[13px] font-bold transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none sm:px-4"
            style={{
              background: "var(--brand-action)",
              color: "var(--brand-action-ink)",
            }}
          >
            Create an account
          </Link>
        </nav>
      </header>

      {/* items-center on the desktop row so the pitch and the finder card
          optically balance instead of the card hanging from the top. */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-12 px-4 pt-6 pb-12 sm:px-6 sm:pt-10 lg:flex-row lg:items-center lg:gap-16">
        {/* Pitch */}
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <p className="m-0 font-mono text-[10.5px] font-semibold tracking-[0.08em] text-white/55 uppercase">
            Attendance for student orgs
          </p>
          <h1 className="m-0 text-[40px] leading-[1.03] font-extrabold tracking-tight sm:text-[52px]">
            Fifteen seconds
            <br />
            at the door.
          </h1>
          <p className="m-0 max-w-lg text-[15px] leading-relaxed text-white/75">
            Guests check in with an email and no account. Officers get the
            roster, the answers and the CSV before the meeting ends.
          </p>

          <ol className="m-0 mt-2 flex list-none flex-col gap-4 p-0">
            {HOW_IT_WORKS.map((step, i) => (
              <li key={step.title} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex-none font-mono text-[10.5px] font-semibold text-white/40"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold">
                    {step.title}
                  </span>
                  <span className="block text-[13px] leading-relaxed text-white/65">
                    {step.body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* Find your club */}
        <div className="w-full lg:max-w-sm">
          <div className="flex flex-col gap-4 rounded-[var(--radius-phone)] border border-white/18 bg-white/10 p-5 backdrop-blur-md sm:p-6">
            <ClubFinder clubs={clubs} />
            <p className="m-0 border-t border-white/12 pt-4 text-[12.5px] leading-relaxed text-white/55">
              Run a club and want it here?{" "}
              <Link
                href="/sign-up"
                className="font-semibold text-white underline underline-offset-2"
              >
                Request an org →
              </Link>
            </p>
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-[12px] text-white/45 sm:px-6">
        Built by the ACM at UF design team
      </footer>
    </div>
  );
}

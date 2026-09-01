import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { StatsView } from "@/components/stats/stats-view";
import { getMemberStats, getMeetingsPage } from "@/lib/stats-data";
import type { Scope } from "@/lib/stats-terms";

// Never serve this route from the full-route cache. It is per-user (attendance,
// membership) and it must reflect a check-in the moment it lands -- a member
// who just checked in and opened stats seeing their old count is the exact
// symptom this page is meant not to have. auth() already opts the route out in
// practice; stating it means a future refactor cannot quietly re-cache it.
export const dynamic = "force-dynamic";

export default async function StatsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/");

  let stats;
  try {
    stats = await getMemberStats(orgSlug);
  } catch (err) {
    // Only an unknown slug renders the friendly "not found" state; any other
    // failure (DB/runtime) must surface, not masquerade as a missing club.
    if (err instanceof Error && err.message === "ORG_NOT_FOUND") {
      return (
        // Matches the error panel on the org home page -- a bare centred <p>
        // on the gradient read as a broken page rather than a handled state.
        <main className="mx-auto flex min-h-[calc(100dvh-var(--org-nav-h))] w-full max-w-md flex-col justify-center px-5 py-8">
          <div className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-6">
            <p className="m-0 font-mono text-[10px] font-semibold tracking-[0.08em] text-ink-faint uppercase">
              Org not found
            </p>
            <p className="m-0 text-[17px] font-bold text-ink">
              No org at /{orgSlug}
            </p>
            <p className="m-0 text-[13.5px] leading-relaxed text-ink-muted">
              Check the link or scan the QR again.
            </p>
          </div>
        </main>
      );
    }
    throw err;
  }

  const initialScope: Scope = stats.terms[0]?.key ?? "all";
  const initialPage = await getMeetingsPage(stats.orgId, initialScope, "attended", 1);

  return (
    <main className="w-full">
      <StatsView stats={stats} initialScope={initialScope} initialPage={initialPage} />
    </main>
  );
}

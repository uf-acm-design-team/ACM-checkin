import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { StatsView } from "@/components/stats/stats-view";
import { getMemberStats, getMeetingsPage } from "@/lib/stats-data";
import type { Scope } from "@/lib/stats-terms";

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
        <main className="flex min-h-[calc(100dvh-var(--org-nav-h))] flex-col items-center justify-center px-4 py-8 sm:px-6">
          <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-white/10 p-5 text-center shadow-2xl backdrop-blur-md sm:p-8">
            <p className="text-lg text-white sm:text-xl">Club does not exist</p>
          </div>
        </main>
      );
    }
    throw err;
  }

  const initialScope: Scope = stats.terms[0]?.key ?? "all";
  const initialPage = await getMeetingsPage(stats.orgId, initialScope, "attended", 1);

  return (
    <main className="mx-auto w-full max-w-4xl">
      <StatsView stats={stats} initialScope={initialScope} initialPage={initialPage} />
    </main>
  );
}

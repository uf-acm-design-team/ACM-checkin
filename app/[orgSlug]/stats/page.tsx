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
        <main className="mx-auto w-full max-w-4xl px-6 py-12">
          <p className="text-center text-white/80">Club does not exist</p>
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

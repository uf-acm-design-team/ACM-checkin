
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { AttendancePerMeetingChart } from "@/components/charts/attendance-per-meeting-chart";
import type { AnalyticsRange } from "@/components/charts/attendance-per-meeting-chart";
import { createServiceSupabaseClient } from "@/app/utils/supabase/server";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { userId } = await auth();

  if (!userId) redirect("/");

  const supabase = createServiceSupabaseClient();

  const { data: organization, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .single();

  if (error || !organization) {
    return (
      <main className="min-h-screen bg-background p-8">
        <p className="text-ink">
          Organization not found.
        </p>
      </main>
    );
  }

  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 30);

  const range: AnalyticsRange = {
    preset: "30d",
    from: start.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    start: start.toISOString(),
    end: now.toISOString(),
  };

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-3xl font-bold text-ink">
          Attendance Analytics
        </h1>

        <AttendancePerMeetingChart
          orgId={organization.id}
          range={range}
        />
      </div>
    </main>
  );
}

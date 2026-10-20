
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import {
  AttendancePerMeetingChart,
  type AttendanceByMeeting,
  type AttendanceDateRange,
} from "@/components/charts/attendance-per-meeting-chart";

import { getAttendanceChartData } from "@/lib/attendance-chart-data";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { userId } = await auth();

  if (!userId) redirect("/");

  const dateRange: AttendanceDateRange = {
    from: "2026-09-01T00:00:00Z",
    to: "2026-11-01T00:00:00Z",
  };

  let data: AttendanceByMeeting[] = [];
  let errorMessage: string | undefined;

  try {
    data = await getAttendanceChartData(orgSlug, dateRange);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Unable to retrieve attendance data.";
  }

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-3xl font-bold text-ink">
          Attendance Analytics
        </h1>

        <AttendancePerMeetingChart
          data={data}
          dateRange={dateRange}
          state={errorMessage ? "error" : "normal"}
          errorMessage={errorMessage}
        />
      </div>
    </main>
  );
}

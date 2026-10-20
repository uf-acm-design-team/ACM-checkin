
"use server";

import { auth } from "@clerk/nextjs/server";
import { createServiceSupabaseClient } from "@/app/utils/supabase/server";
import type {
  AttendanceByMeeting,
  AttendanceDateRange,
} from "@/components/charts/attendance-per-meeting-chart";

const ALLOWED_ROLES = new Set([
  "officer",
  "co-owner",
  "owner",
  "admin",
]);

export async function getAttendanceChartData(
  orgSlug: string,
  dateRange: AttendanceDateRange,
): Promise<AttendanceByMeeting[]> {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("You must be signed in to view analytics.");
  }

  const from = new Date(dateRange.from);
  const to = new Date(dateRange.to);

  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from > to
  ) {
    throw new Error("Invalid attendance date range.");
  }

  const supabase = createServiceSupabaseClient();

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .single();

  if (orgError || !organization) {
    throw new Error("Organization not found.");
  }

  const { data: attendee, error: attendeeError } = await supabase
    .from("attendees")
    .select("admin")
    .eq("user_id", userId)
    .maybeSingle();

  if (attendeeError) {
    throw new Error("Unable to verify administrator permissions.");
  }

  const isGlobalAdmin = attendee?.admin === true;

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("role, status")
    .eq("org_id", organization.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    throw new Error("Unable to verify organization permissions.");
  }

  const isOfficer =
    ALLOWED_ROLES.has((membership?.role ?? "").toLowerCase()) &&
    membership?.status === "active";

  if (!isGlobalAdmin && !isOfficer) {
    throw new Error("You do not have permission to view analytics.");
  }

  const { data, error } = await supabase.rpc(
    "get_org_attendance_by_meeting",
    {
      p_org_id: organization.id,
      p_start_time: from.toISOString(),
      p_end_time: to.toISOString(),
    },
  );

  if (error) {
    throw new Error(`Failed to load attendance: ${error.message}`);
  }

  return (data ?? []) as AttendanceByMeeting[];
}

"use server";

import { createClient } from "../../utils/supabase/client";

const ORG_MEMBERSHIP_THRESHOLDS: Record<string, number> = {
  // Add org slugs and their required attendance count here
  "ACM": 3,
};
const DEFAULT_THRESHOLD = 0;

export async function resolveAndUpdateMembershipStatus(
  userId: string,
  attendeeId: string,
  orgId: string,
  orgSlug: string
): Promise<{ attendanceCount: number; status: string }> {
  const supabase = createClient();
  const threshold = ORG_MEMBERSHIP_THRESHOLDS[orgSlug] ?? DEFAULT_THRESHOLD;

  const { count } = await supabase
    .from("attendance")
    .select("*", { count: "exact", head: true })
    .eq("attendee_id", attendeeId)
    .eq("org_id", orgId);

  const status = (count ?? 0) >= threshold ? "active" : "pending";

  await supabase
    .from("memberships")
    .upsert(
      { user_id: userId, org_id: orgId, role: "member", status },
      { onConflict: "org_id,user_id" }
    );

  return { attendanceCount: count ?? 0, status };
}

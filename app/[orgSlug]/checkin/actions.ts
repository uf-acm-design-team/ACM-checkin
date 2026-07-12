"use server";

import { createClient } from "../../utils/supabase/client";
import { membershipThreshold } from "@/lib/membership";

export async function resolveAndUpdateMembershipStatus(
  userId: string,
  attendeeId: string,
  orgId: string,
  orgSlug: string
): Promise<{ attendanceCount: number; status: string }> {
  const supabase = createClient();
  const threshold = membershipThreshold(orgSlug);

  const { count } = await supabase
    .from("attendance")
    .select("*", { count: "exact", head: true })
    .eq("attendee_id", attendeeId)
    .eq("org_id", orgId);

  // No configured threshold (null) means the org has no attendance-based
  // membership gate, so check-ins never auto-promote to "active" — matches
  // resolveMembership, which won't count a bare attendance total as membership.
  const status =
    threshold !== null && (count ?? 0) >= threshold ? "active" : "pending";

  // Preserve an existing role (e.g. officer/owner) — only default to "member"
  // when creating the membership row for the first time.
  const { data: existing } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  await supabase
    .from("memberships")
    .upsert(
      { user_id: userId, org_id: orgId, role: existing?.role ?? "member", status },
      { onConflict: "org_id,user_id" }
    );

  return { attendanceCount: count ?? 0, status };
}

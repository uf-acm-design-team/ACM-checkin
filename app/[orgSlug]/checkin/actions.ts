"use server";

import { auth } from "@clerk/nextjs/server";

import { createClerkSupabaseClient } from "../../utils/supabase/server";
import { membershipThreshold } from "@/lib/membership";

export async function resolveAndUpdateMembershipStatus(
  attendeeId: string,
  orgId: string,
  orgSlug: string
): Promise<{ attendanceCount: number; status: string }> {
  // Identity is read from the session here, never accepted as an argument.
  // This used to take `userId` from the caller -- a client could pass any
  // Clerk id and promote a stranger's membership. It also used the browser
  // anon client, so it carried no identity at all despite being "use server".
  const { userId } = await auth();
  if (!userId) throw new Error("NOT_AUTHENTICATED");

  const supabase = createClerkSupabaseClient();
  const threshold = membershipThreshold(orgSlug);

  // Confirm the attendee row belongs to the caller before counting against it.
  // RLS also enforces this, but failing loudly here beats a silent zero count.
  const { data: attendee } = await supabase
    .from("attendees")
    .select("id")
    .eq("id", attendeeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!attendee) throw new Error("ATTENDEE_MISMATCH");

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

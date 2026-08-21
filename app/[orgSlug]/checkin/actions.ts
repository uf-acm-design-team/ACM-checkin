"use server";

import { auth } from "@clerk/nextjs/server";

import { createClerkSupabaseClient } from "../../utils/supabase/server";
import { membershipThreshold } from "@/lib/membership";
import { parseSchema, validateAnswers } from "@/lib/form-schema";

export type MemberCheckInResult =
  | { ok: true; alreadyCheckedIn?: boolean }
  | { ok: false; error: string; answerErrors?: Record<string, string> };

/**
 * Check in a signed-in member, with their form answers.
 *
 * The browser used to write the attendance row itself. That was fine for the
 * row's own columns -- RLS constrains those -- but there is no way to express
 * "answers must match this meeting's form_schema" as a policy, so a member could
 * post arbitrary jsonb into attendance.answers and it would be accepted. Moving
 * the write here puts the schema check on the same side of the trust boundary
 * as the insert.
 *
 * The meeting id is NOT taken from the caller: it is resolved server-side from
 * the org's currently-active meeting, the same rule guestCheckIn() follows, so a
 * replayed id cannot backfill a closed meeting.
 */
export async function memberCheckIn(input: {
  orgSlug: string;
  answers: unknown;
  password?: string;
}): Promise<MemberCheckInResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const supabase = createClerkSupabaseClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", input.orgSlug)
    .maybeSingle();
  if (!org) return { ok: false, error: "Club does not exist." };

  // RLS (meetings_member_read) already hides officer-only meetings from a
  // non-officer caller, so this naturally only ever resolves to a meeting
  // this member is allowed to see -- no extra filter needed here.
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, form_schema")
    .eq("org_id", org.id)
    .eq("status", true)
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!meeting) return { ok: false, error: "There is no active meeting." };

  // checkin_password is column-locked from direct SELECT (this client runs
  // as `authenticated`, not service_role), so verification goes through a
  // SECURITY DEFINER RPC rather than reading the value here.
  const { data: passwordOk, error: passwordError } = await supabase.rpc(
    "verify_meeting_checkin_password",
    { p_meeting_id: meeting.id, p_password: input.password ?? "" },
  );
  if (passwordError) {
    return { ok: false, error: "Could not verify the meeting password." };
  }
  if (!passwordOk) {
    return { ok: false, error: "Incorrect meeting password." };
  }

  const { data: attendee } = await supabase
    .from("attendees")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!attendee) {
    return { ok: false, error: "No attendee profile found for your account." };
  }

  // Validated against the schema read here, never one supplied by the caller.
  const schema = parseSchema(meeting.form_schema);
  const validated = validateAnswers(schema, input.answers);
  if (!validated.ok) {
    return {
      ok: false,
      error: "Answer the required questions before checking in.",
      answerErrors: validated.errors,
    };
  }

  const { error: attendanceError } = await supabase.from("attendance").insert({
    attendee_id: attendee.id,
    org_id: org.id,
    meeting_id: meeting.id,
    source: "authenticated",
    // NULL rather than {} when the meeting asks nothing, matching how the
    // migration normalized historical rows.
    answers:
      Object.keys(validated.answers).length > 0 ? validated.answers : null,
  });

  if (attendanceError) {
    // 23505 = the unique (meeting_id, attendee_id) constraint. The member is
    // already checked in, which is not a failure from their point of view --
    // but say so, since unlike a guest they are looking at a button they just
    // pressed and expect a distinct outcome.
    if (attendanceError.code === "23505") {
      return { ok: true, alreadyCheckedIn: true };
    }
    return { ok: false, error: attendanceError.message };
  }

  return { ok: true };
}

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

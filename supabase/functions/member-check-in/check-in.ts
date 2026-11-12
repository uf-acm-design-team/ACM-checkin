import { parseSchema, validateAnswers } from "../../../lib/form-schema.ts";
import { checkGeofence, geofenceErrorMessage } from "../../../lib/geo.ts";
import { isWithinMeetingWindow } from "../../../lib/meeting-time.ts";
import { membershipThreshold } from "../../../lib/membership.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { MemberCheckInResponse, MemberCheckInSuccess } from "./contract.ts";
import type { ParsedCheckIn } from "./validate.ts";

// This is an implementation of the check-in logic itself.
// It closely follows the logic in memberCheckIn() and resolveAndUpdateMembershipStatus()
// from app/[orgSlug]/checkin/actions.ts, in the same order, following the
// ADTCIA-31 rules inventory I created.
//
// `supabase` is the caller's client (Clerk JWT, not service_role), so every
// read and write is held to the same RLS policies as the web action.

function serverError(error: string): MemberCheckInResponse {
  return { ok: false, code: "server_error", error };
}

export async function performCheckIn(
  supabase: SupabaseClient,
  clerkId: string,
  input: ParsedCheckIn,
): Promise<MemberCheckInResponse> {
  // Rule 2: the org must exist.
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, slug")
    .eq("slug", input.orgSlug)
    .maybeSingle();
  if (orgError) {
    console.error("Org lookup error:", orgError);
    return serverError("Could not look up the club.");
  }
  if (!org) return { ok: false, code: "org_not_found", error: "Club does not exist." };

  // Rule 3: open meetings for this org. RLS (meetings_member_read) hides
  // officer-only meetings from non-officers. It also lets members of the org
  // see closed meetings, so the status filter here is load-bearing.
  // The status filter is load-bearing because it prevents users from seeing 
  // closed meetings that an officer has not opened.
  const { data: allOpenMeetings, error: meetingsError } = await supabase
    .from("meetings")
    .select(
      "id, form_schema, start_time, end_time, is_geo_locked, latitude, longitude, radius_meters",
    )
    .eq("org_id", org.id)
    .eq("status", true)
    .order("start_time", { ascending: true });
  if (meetingsError) {
    console.error("Meetings lookup error:", meetingsError);
    return serverError("Could not look up meetings.");
  }

  // Rule 4: status=true is the officer's switch; "now" must also be inside
  // the meeting's own scheduled window for us to show it to the user.
  const now = new Date();
  const openMeetings = (allOpenMeetings ?? []).filter((m) =>
    isWithinMeetingWindow(now, m.start_time, m.end_time),
  );
  if (openMeetings.length === 0) {
    return { ok: false, code: "no_active_meeting", error: "There is no active meeting." };
  }

  // Rule 5: pick among the rows RLS returned, so an id can select a meeting
  // but never reach one the caller can't see. We use the same fallback
  // as web where with a single open meeting an unmatched id resolves to it.
  let meeting = openMeetings[0];
  if (input.meetingId) {
    const chosen = openMeetings.find((m) => m.id === input.meetingId);
    if (!chosen && openMeetings.length > 1) {
      return { ok: false, code: "meeting_closed", error: "That meeting is no longer open." };
    }
    meeting = chosen ?? meeting;
  }

  // Rule 11: the geolock, enforced here rather than trusted from the client.
  const geo = checkGeofence(meeting, input.location);
  if (!geo.ok) {
    return {
      ok: false,
      code: "outside_geofence",
      error: geofenceErrorMessage(geo.failure),
      geo: geo.failure,
    };
  }

  // Rule 6: checkin_password is column-locked from this role, so the
  // comparison happens in a SECURITY DEFINER RPC. No password set -> true.
  const { data: passwordOk, error: passwordError } = await supabase.rpc(
    "verify_meeting_checkin_password",
    { p_meeting_id: meeting.id, p_password: input.password ?? "" },
  );
  if (passwordError) {
    console.error("Password verification error:", passwordError);
    return serverError("Could not verify the meeting password.");
  }
  if (!passwordOk) {
    return { ok: false, code: "wrong_password", error: "Incorrect meeting password." };
  }

  // Rule 7: the caller needs an attendee profile (created by onboard-attendee).
  const { data: attendee, error: attendeeError } = await supabase
    .from("attendees")
    .select("id")
    .eq("user_id", clerkId)
    .maybeSingle();
  if (attendeeError) {
    console.error("Attendee lookup error:", attendeeError);
    return serverError("Could not look up your attendee profile.");
  }
  if (!attendee) {
    return {
      ok: false,
      code: "no_profile",
      error: "No attendee profile found for your account.",
    };
  }

  // Rule 8: answers are validated against the schema read here, never one
  // supplied by the caller.
  const schema = parseSchema(meeting.form_schema);
  const validated = validateAnswers(schema, input.answers);
  if (!validated.ok) {
    return {
      ok: false,
      code: "invalid_answers",
      error: "Answer the required questions before checking in.",
      answerErrors: validated.errors,
    };
  }

  // Rule 9: record the attendance.
  const { error: attendanceError } = await supabase.from("attendance").insert({
    attendee_id: attendee.id,
    org_id: org.id,
    meeting_id: meeting.id,
    source: "authenticated",
    // NULL rather than {} when the meeting asks nothing, matching how the
    // migration normalized historical rows.
    answers: Object.keys(validated.answers).length > 0 ? validated.answers : null,
  });

  if (attendanceError) {
    // Rule 10: 23505 is the unique (meeting_id, attendee_id) constraint. Not a
    // failure for the member, but a distinct outcome. Web skips the
    // membership update in this case too.
    if (attendanceError.code === "23505") {
      return { ok: true, meetingId: meeting.id, alreadyCheckedIn: true };
    }
    // 42501 is attendance_insert_own rejecting the row: the meeting was closed
    // between the lookup above and this insert.
    if (attendanceError.code === "42501") {
      return { ok: false, code: "meeting_closed", error: "That meeting is no longer open." };
    }
    console.error("Attendance insert error:", attendanceError);
    return serverError("Could not record your check-in.");
  }

  const membership = await updateMembershipStatus(supabase, clerkId, attendee.id, org);
  return {
    ok: true,
    meetingId: meeting.id,
    alreadyCheckedIn: false,
    ...(membership && { membership }),
  };
}

// Rule 12: resolveAndUpdateMembershipStatus(). Best effort, like web: the
// check-in has already landed, so a failure here is logged, not returned.
// Skipped for orgs with no threshold, which web never calls it for either.
// Maybe in the future we should consider making membershipThresholds a column on the 
// organization table instead of hardcoded in our codebase.
async function updateMembershipStatus(
  supabase: SupabaseClient,
  clerkId: string,
  attendeeId: string,
  org: { id: string; slug: string },
): Promise<MemberCheckInSuccess["membership"]> {
  const threshold = membershipThreshold(org.slug);
  if (threshold === null) return undefined;

  const { count, error: countError } = await supabase
    .from("attendance")
    .select("*", { count: "exact", head: true })
    .eq("attendee_id", attendeeId)
    .eq("org_id", org.id);
  if (countError) {
    console.error("Attendance count error:", countError);
    return undefined;
  }

  const attended = count ?? 0;
  const status = attended >= threshold ? "active" : "pending";

  // Preserve an existing role (e.g. officer/owner); default to "member" only
  // when creating the row. RLS (memberships_self_status) only lets a caller
  // update their own row while it is role 'member', so for officers this
  // upsert is rejected, exactly as it is on web.
  const { data: existing } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", clerkId)
    .maybeSingle();

  const { error: upsertError } = await supabase
    .from("memberships")
    .upsert(
      { user_id: clerkId, org_id: org.id, role: existing?.role ?? "member", status },
      { onConflict: "org_id,user_id" },
    );
  if (upsertError) {
    console.warn("Non-fatal: membership status update failed:", upsertError);
  }

  return { attended, threshold };
}

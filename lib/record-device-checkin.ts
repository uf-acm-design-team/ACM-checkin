import type { SupabaseClient } from "@supabase/supabase-js";

import { DEVICE_ALREADY_CHECKED_IN_MESSAGE } from "./checkin-device";

type AttendanceInput = {
  attendee_id: string;
  org_id: string;
  meeting_id: string;
  source: "guest" | "authenticated";
  device_id: string;
  answers: Record<string, unknown> | null;
};

/** The unique index arbitrates concurrent requests, including across instances. */
export async function recordDeviceCheckIn(
  supabase: SupabaseClient,
  row: AttendanceInput,
): Promise<{ ok: true; alreadyCheckedIn?: boolean } | { ok: false; error: string }> {
  const { error } = await supabase.from("attendance").insert(row);
  if (!error) return { ok: true };

  if (error.code === "23505") {
    // Either unique key may fire on a retry. Only report success if THIS
    // attendee already has attendance; a device used by someone else is a failure.
    const { data: existing, error: lookupError } = await supabase
      .from("attendance")
      .select("id")
      .eq("meeting_id", row.meeting_id)
      .eq("attendee_id", row.attendee_id)
      .maybeSingle();
    if (lookupError) {
      return { ok: false, error: "Could not confirm your check-in. Try again." };
    }
    if (existing) return { ok: true, alreadyCheckedIn: true };
    if (error.message.includes("attendance_meeting_device_key")) {
      return { ok: false, error: DEVICE_ALREADY_CHECKED_IN_MESSAGE };
    }
  }

  return { ok: false, error: error.message };
}

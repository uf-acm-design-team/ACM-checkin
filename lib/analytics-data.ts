import { createClerkSupabaseClient } from "@/app/utils/supabase/server";

export interface AttendanceRecord {
  meeting_id: string;
  meeting_title: string;
  meeting_start_time: string;
  total_attendees: number;
  member_count: number;
  guest_count: number;
}

export async function getOrgAttendance(
  orgId: string, 
  startTime: string, 
  endTime: string
): Promise<AttendanceRecord[]> {
  const supabase = createClerkSupabaseClient();

  const { data, error } = await supabase
    .rpc('get_org_attendance_by_meeting', {
      p_org_id: orgId,
      p_start_time: startTime,
      p_end_time: endTime
    });

  if (error) {
    throw new Error(`Failed to fetch attendance data: ${error.message}`);
  }

  return (data as AttendanceRecord[]) || [];
}

export interface RetentionRecord {
  meeting_title: string;
  meeting_start_time: string;
  meeting_id: string;
  first_time: number;
  returning: number;
  total: number;
}

export async function getOrgRetention(
  orgId: string, 
  startTime: string, 
  endTime: string
): Promise<RetentionRecord[]> {
  const supabase = createClerkSupabaseClient();

  const { data, error } = await supabase
    .rpc('get_org_retention_by_meeting', {
      p_org_id: orgId,
      p_start_time: startTime,
      p_end_time: endTime
    });

  if (error) {
    throw new Error(`Failed to fetch attendance data: ${error.message}`);
  }

  return (data as RetentionRecord[]) || [];
}
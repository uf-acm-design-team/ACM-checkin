import { createClient } from "../app/utils/supabase/client"

export interface AttendanceRecord {
  meeting_id: string;
  meeting_title: string;
  meeting_date: string;
  member_count: number;
  guest_count: number;
  total_attendees: number;
}

export async function getOrgAttendance(
  orgId: string, 
  startTime: string, 
  endTime: string
): Promise<AttendanceRecord[]> {
  const supabase = createClient();

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
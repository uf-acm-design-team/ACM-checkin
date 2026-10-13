CREATE OR REPLACE FUNCTION get_org_attendance_by_meeting(
    p_org_id uuid,
    p_start_time timestamptz,
    p_end_time timestamptz
)
RETURNS TABLE (
    meeting_id uuid,
    title text,
    start_time timestamptz,
    total bigint,
    members bigint,
    guests bigint
)
LANGUAGE sql
SECURITY INVOKER
AS $$
    SELECT 
        m.id AS meeting_id,
        m.title,
        m.start_time,
        COUNT(a.id) AS total,
        COUNT(a.id) FILTER (WHERE a.attendee_id IS NOT NULL) AS members,
        COUNT(a.id) FILTER (WHERE a.attendee_id IS NULL) AS guests
    FROM meetings m
    LEFT JOIN attendance a ON m.id = a.meeting_id
    WHERE m.org_id = p_org_id
      AND m.start_time >= p_start_time
      AND m.start_time <= p_end_time
    GROUP BY m.id, m.title, m.start_time
    ORDER BY m.start_time ASC;
$$;
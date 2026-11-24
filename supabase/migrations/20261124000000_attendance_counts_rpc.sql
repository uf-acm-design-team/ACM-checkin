-- Returns per-meeting attendance counts in one round trip, avoiding the
-- max_rows = 1000 PostgREST cap that silently truncated the client-side tally.
-- SECURITY INVOKER: RLS on `attendance` still applies, so the caller only
-- counts rows they can already read.

CREATE FUNCTION attendance_counts_by_meeting(p_meeting_ids uuid[])
RETURNS TABLE (meeting_id uuid, attendance_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT a.meeting_id, count(*)::bigint AS attendance_count
  FROM attendance a
  WHERE a.meeting_id = ANY(p_meeting_ids)
  GROUP BY a.meeting_id;
$$;

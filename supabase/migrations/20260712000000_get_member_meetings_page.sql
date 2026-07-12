-- Server-side paginated meetings feed for the member stats view.
--
-- Replaces the previous client approach of materializing a user's attended
-- meeting ids into the request URL (id=in.(...) for "attended",
-- id=not.in.(...) for "missed"). That list grows with a member's attendance
-- history and could exceed the proxy URL length limit (HTTP 414) for the most
-- engaged members. Here the attended/missed filter and the per-meeting
-- "attended" flag are computed entirely in Postgres.
--
-- p_attendee_id may be NULL (no signed-in attendee): `attendee_id = NULL` is
-- never true, so every meeting reads as not-attended -> "attended" returns
-- nothing and "missed" returns everything, matching the app's prior behavior.
--
-- total_count is a window count over the full filtered set (before limit/offset)
-- so the caller gets the page and the total in a single round trip. `exists`
-- (not a join/count) keeps a duplicate attendance row from double-affecting the
-- flag.

CREATE OR REPLACE FUNCTION "public"."get_member_meetings_page"(
    "p_org_id" "uuid",
    "p_attendee_id" "uuid",
    "p_start" timestamp without time zone,
    "p_end" timestamp without time zone,
    "p_view" "text",
    "p_limit" integer,
    "p_offset" integer
)
RETURNS TABLE (
    "id" "uuid",
    "title" "text",
    "start_time" timestamp without time zone,
    "description" "text",
    "questions" "text"[],
    "attended" boolean,
    "total_count" bigint
)
LANGUAGE "sql"
STABLE
AS $$
    WITH occurred AS (
        SELECT
            m.id, m.title, m.start_time, m.description, m.questions,
            EXISTS (
                SELECT 1 FROM "public"."attendance" a
                WHERE a.meeting_id = m.id
                  AND a.attendee_id = p_attendee_id
            ) AS attended
        FROM "public"."meetings" m
        WHERE m.org_id = p_org_id
          AND m.start_time >= p_start
          AND m.start_time <= p_end
    )
    SELECT
        o.id, o.title, o.start_time, o.description, o.questions, o.attended,
        COUNT(*) OVER () AS total_count
    FROM occurred o
    WHERE p_view = 'all'
       OR (p_view = 'attended' AND o.attended)
       OR (p_view = 'missed' AND NOT o.attended)
    ORDER BY o.start_time DESC
    LIMIT p_limit
    OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION "public"."get_member_meetings_page"(
    "uuid", "uuid", timestamp without time zone, timestamp without time zone,
    "text", integer, integer
) TO "anon", "authenticated", "service_role";

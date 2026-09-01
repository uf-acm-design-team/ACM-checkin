-- Bring get_member_meetings_page in line with meetings.start_time being
-- `timestamptz`.
--
-- 20260827000000 converted meetings.start_time / end_time from
-- `timestamp without time zone` to timestamptz and fixed the one function whose
-- correctness depended on the old type -- close_expired_meetings(). This
-- function was missed, and it has the same class of bug in two places.
--
-- WHAT WAS BROKEN
-- ---------------
-- 1. The parameters. p_start / p_end were declared `timestamp without time
--    zone` and compared against a now-timestamptz column:
--
--        AND m.start_time >= p_start
--        AND m.start_time <= p_end
--
--    Postgres resolves timestamptz >= timestamp by casting the tz-less side
--    into the SERVER's timezone, which on Supabase is UTC. The caller
--    (lib/stats-data.ts) builds these bounds from termBounds(), which returns
--    real Eastern-anchored instants -- so the whole window slid 4-5 hours.
--    Meetings near a term boundary landed in the neighbouring term, or in
--    neither, and the list disagreed with the term totals computed in JS.
--
-- 2. The RETURNS TABLE column. `start_time timestamp without time zone` forced
--    the real instant back down to a naive UTC wall clock on the way out,
--    stripping the offset. The client then rendered that as if it were Eastern,
--    showing every meeting 4-5 hours late.
--
-- Both sides are instants now, so the comparison needs no cast and is correct
-- from any server timezone and across DST transitions.
--
-- Also adds `a.org_id = p_org_id` to the attendance EXISTS. meeting_id is
-- already unique per org so this changes no result today, but every other read
-- in lib/stats-data.ts scopes attendance by org and this one silently did not.
--
-- CREATE OR REPLACE cannot change either the argument types (that would create
-- an overload, leaving the broken original in place for PostgREST to pick) or
-- the RETURNS TABLE columns, which are OUT parameters:
--     42P13 cannot change return type of existing function
-- So the old function is dropped first. Drop + create in one migration file is
-- a single transaction, so there is no window where the function is missing.

DROP FUNCTION IF EXISTS "public"."get_member_meetings_page"(
    "uuid", "uuid", timestamp without time zone, timestamp without time zone,
    "text", integer, integer
);

CREATE FUNCTION "public"."get_member_meetings_page"(
    "p_org_id" "uuid",
    "p_attendee_id" "uuid",
    "p_start" timestamp with time zone,
    "p_end" timestamp with time zone,
    "p_view" "text",
    "p_limit" integer,
    "p_offset" integer
)
RETURNS TABLE (
    "id" "uuid",
    "title" "text",
    "start_time" timestamp with time zone,
    "description" "text",
    "form_schema" "jsonb",
    "attended" boolean,
    "total_count" bigint
)
LANGUAGE "sql"
STABLE
AS $$
    WITH occurred AS (
        SELECT
            m.id, m.title, m.start_time, m.description, m.form_schema,
            EXISTS (
                SELECT 1 FROM "public"."attendance" a
                WHERE a.meeting_id = m.id
                  AND a.attendee_id = p_attendee_id
                  AND a.org_id = p_org_id
            ) AS attended
        FROM "public"."meetings" m
        WHERE m.org_id = p_org_id
          AND m.start_time >= p_start
          AND m.start_time <= p_end
    )
    SELECT
        o.id, o.title, o.start_time, o.description, o.form_schema, o.attended,
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
    "uuid", "uuid", timestamp with time zone, timestamp with time zone,
    "text", integer, integer
) TO "anon", "authenticated", "service_role";

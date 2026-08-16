-- Point get_member_meetings_page at meetings.form_schema instead of the legacy
-- meetings.questions text[].
--
-- The caller (lib/stats-data.ts) only uses this column to decide whether a
-- meeting has anything worth opening a details modal for -- `hasDetails`. It
-- never renders the questions from this feed; the modal refetches the full row
-- via getMeetingDetails(). So the RPC returns form_schema verbatim and the
-- caller keeps making that same "is it non-empty" decision.
--
-- CREATE OR REPLACE cannot change a function's OUT parameters, and the RETURNS
-- TABLE columns are OUT parameters -- swapping `questions text[]` for
-- `form_schema jsonb` fails with
--     42P13 cannot change return type of existing function
-- so the old function has to be dropped first. The argument list is unchanged,
-- so this is a drop-and-recreate of the same signature, not a new overload.
-- Dropping and recreating in one transaction (which is how supabase applies a
-- migration file) means no window where the function is missing.

DROP FUNCTION IF EXISTS "public"."get_member_meetings_page"(
    "uuid", "uuid", timestamp without time zone, timestamp without time zone,
    "text", integer, integer
);

CREATE FUNCTION "public"."get_member_meetings_page"(
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
    "uuid", "uuid", timestamp without time zone, timestamp without time zone,
    "text", integer, integer
) TO "anon", "authenticated", "service_role";

-- Meeting visibility levels (officer-only meetings, fully hidden from
-- regular members and guests -- not just blocked at check-in) and an
-- optional check-in password ("room code"), required from both members and
-- guests. Confirmed design (see conversation, not re-derivable from code):
--   - officer-only is a simple toggle: everyone vs officer+.
--   - the password is plaintext and officer-retrievable (a low-stakes room
--     code, not a real credential) -- but still not exposed through the
--     general meetings SELECT surface; only through the two functions below.

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."meetings"
    ADD COLUMN "is_officer_only" boolean NOT NULL DEFAULT false,
    ADD COLUMN "checkin_password" "text";

-- Safe to expose broadly -- tells the client whether to render a password
-- field without exposing the password itself, which stays locked down below.
ALTER TABLE "public"."meetings"
    ADD COLUMN "requires_checkin_password" boolean
        GENERATED ALWAYS AS ("checkin_password" IS NOT NULL) STORED;

-- checkin_password must never be readable through the general meetings
-- SELECT surface. anon/authenticated both hold a blanket
-- GRANT SELECT ON meetings from 20260813000100_enable_rls_clerk.sql, which
-- -- absent this REVOKE -- would cover this new column too (table-level
-- grants apply to columns added later). The only two ways to read it back
-- are get_meeting_password() (officer-gated) and
-- verify_meeting_checkin_password() (comparison only, never returns the
-- value) below -- both SECURITY DEFINER, so they read the column as the
-- function owner regardless of this REVOKE.
REVOKE SELECT ("checkin_password") ON TABLE "public"."meetings" FROM "anon", "authenticated";


-- ---------------------------------------------------------------------------
-- 2. Visibility: officer-only meetings are invisible to anon and to
--    non-officer members entirely, not just blocked at check-in time.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "meetings_anon_read_active" ON "public"."meetings";
CREATE POLICY "meetings_anon_read_active" ON "public"."meetings"
    FOR SELECT TO "anon"
    USING ("status" = true AND NOT "is_officer_only");

DROP POLICY IF EXISTS "meetings_member_read" ON "public"."meetings";
CREATE POLICY "meetings_member_read" ON "public"."meetings"
    FOR SELECT TO "authenticated"
    USING (
        "public"."is_org_officer"("org_id")
        OR (
            NOT "is_officer_only"
            AND (
                "status" = true
                OR EXISTS (
                    SELECT 1 FROM "public"."memberships" m
                    WHERE m."org_id" = "meetings"."org_id"
                      AND m."user_id" = "public"."current_clerk_id"()
                )
            )
        )
    );


-- ---------------------------------------------------------------------------
-- 3. Enforcement at check-in time. Defense in depth for the member path,
--    where RLS is still the real boundary; guest-actions.ts runs as
--    service_role and bypasses RLS entirely, so its own explicit query
--    filter (added alongside this migration) is what actually protects it,
--    but this policy is updated too for consistency.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "attendance_insert_own" ON "public"."attendance";
CREATE POLICY "attendance_insert_own" ON "public"."attendance"
    FOR INSERT TO "authenticated"
    WITH CHECK (
        "attendee_id" = "public"."current_attendee_id"()
        AND EXISTS (
            SELECT 1 FROM "public"."meetings" m
            WHERE m."id" = "attendance"."meeting_id"
              AND m."org_id" = "attendance"."org_id"
              AND m."status" = true
              AND (NOT m."is_officer_only" OR "public"."is_org_officer"(m."org_id"))
        )
    );

DROP POLICY IF EXISTS "guest_attendance_insert" ON "public"."attendance";
CREATE POLICY "guest_attendance_insert" ON "public"."attendance"
    FOR INSERT TO "anon"
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."meetings" m
            WHERE m."id" = "attendance"."meeting_id"
              AND m."org_id" = "attendance"."org_id"
              AND m."status" = true
              AND NOT m."is_officer_only"
        )
    );


-- ---------------------------------------------------------------------------
-- 4. Password read-back (officer-only) and verification (anyone, but only
--    ever returns a boolean -- never the value itself).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."get_meeting_password"("p_meeting_id" "uuid")
RETURNS "text"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
    v_org_id "uuid";
    v_password "text";
BEGIN
    SELECT "org_id", "checkin_password" INTO v_org_id, v_password
    FROM "public"."meetings"
    WHERE "id" = p_meeting_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'meeting not found' USING ERRCODE = '22023';
    END IF;

    IF NOT "public"."is_org_officer"(v_org_id) THEN
        RAISE EXCEPTION 'not authorized to view this meeting''s password' USING ERRCODE = '42501';
    END IF;

    RETURN v_password;
END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."get_meeting_password"("uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_meeting_password"("uuid") TO "authenticated";

-- Used by the member check-in path (checkin/actions.ts), which runs as the
-- calling user (authenticated role -- RLS and the column REVOKE above both
-- apply) rather than service_role. Guests don't need this: guest-actions.ts
-- already runs as service_role and reads checkin_password directly there.
CREATE OR REPLACE FUNCTION "public"."verify_meeting_checkin_password"("p_meeting_id" "uuid", "p_password" "text")
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = "public"
AS $$
    SELECT COALESCE(
        (
            SELECT "checkin_password" IS NULL OR "checkin_password" = p_password
            FROM "public"."meetings"
            WHERE "id" = p_meeting_id
        ),
        false
    );
$$;

REVOKE EXECUTE ON FUNCTION "public"."verify_meeting_checkin_password"("uuid", "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."verify_meeting_checkin_password"("uuid", "text") TO "authenticated";

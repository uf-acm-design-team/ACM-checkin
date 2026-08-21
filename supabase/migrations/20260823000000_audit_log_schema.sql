-- Updated Audit log Schema
--

--   1. Locks INSERT down to SECURITY DEFINER functions only -- no client can
--      write (or forge) an entry directly.
--   2. Adds triggers that log membership role changes/removals, meeting
--      deletions, manual status toggles, and geo-lock changes.
--   3. Adds two RPCs for the things a trigger can't see: attendance CSV
--      export and ownership transfer 

-- Column changes

ALTER TABLE "public"."audit_log" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "public"."audit_log" ALTER COLUMN "target_id" DROP DEFAULT;

ALTER TABLE "public"."audit_log" RENAME COLUMN "user_id" TO "actor_id";

ALTER TABLE "public"."audit_log"
    ADD COLUMN "actor_name" "text" NOT NULL DEFAULT 'unknown',
    ADD COLUMN "scope" "text" NOT NULL DEFAULT 'org',
    ADD COLUMN "target_type" "text",
    ADD COLUMN "metadata" "jsonb" NOT NULL DEFAULT '{}'::"jsonb";

ALTER TABLE "public"."audit_log" ALTER COLUMN "actor_name" DROP DEFAULT;
ALTER TABLE "public"."audit_log" ALTER COLUMN "scope" DROP DEFAULT;
ALTER TABLE "public"."audit_log" ALTER COLUMN "action" SET NOT NULL;

ALTER TABLE "public"."audit_log"
    ADD CONSTRAINT "audit_log_scope_check" CHECK ("scope" IN ('org', 'platform'));

-- Org-scoped events always name an org. Platform events may or may not (an
-- org.deleted entry can't -- see the trigger below for why).
ALTER TABLE "public"."audit_log"
    ADD CONSTRAINT "audit_log_scope_org_check" CHECK ("scope" <> 'org' OR "org_id" IS NOT NULL);

-- Deleting an org must not be blocked by its own audit trail, and old entries
-- should survive with org_id nulled out (metadata carries the name/slug).
ALTER TABLE "public"."audit_log" DROP CONSTRAINT "audit_log_org_id_fkey";
ALTER TABLE "public"."audit_log"
    ADD CONSTRAINT "audit_log_org_id_fkey" FOREIGN KEY ("org_id")
        REFERENCES "public"."organizations"("id") ON DELETE SET NULL;

COMMENT ON TABLE "public"."audit_log" IS
    'Append-only record of officer/owner/admin actions. Written only by SECURITY DEFINER functions -- see _write_audit_log.';


-- 2. Lock down INSERT -- only SECURITY DEFINER functions may write from here

DROP POLICY IF EXISTS "audit_officer_insert" ON "public"."audit_log";
DROP POLICY IF EXISTS "audit_owner_read" ON "public"."audit_log";

REVOKE INSERT ON TABLE "public"."audit_log" FROM "anon", "authenticated";

-- Owners see their org's log; has_org_role() also passes for global admins,
-- so this doubles as the admin drill-into-any-org path. Officers do not get
-- this -- only 'owner'.
CREATE POLICY "audit_owner_read" ON "public"."audit_log"
    FOR SELECT TO "authenticated"
    USING ("scope" = 'org' AND "public"."has_org_role"("org_id", ARRAY['owner']));

-- audit_admin_read (scope-agnostic, is_global_admin()) already exists from
-- 20260822010000_global_admin_org_read_policies.sql and needs no change.


-- Shared insert helper

CREATE OR REPLACE FUNCTION "public"."_write_audit_log"(
    "p_scope" "text",
    "p_org_id" "uuid",
    "p_action" "text",
    "p_target_type" "text",
    "p_target_id" "uuid",
    "p_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "p_actor_id" "text" DEFAULT NULL
)
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
    v_actor_id "text" := COALESCE(p_actor_id, "public"."current_clerk_id"());
    v_actor_name "text";
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'audit log entry requires an actor' USING ERRCODE = '23514';
    END IF;

    IF p_scope = 'org' AND p_org_id IS NULL THEN
        RAISE EXCEPTION 'org-scoped audit log entries require an org_id' USING ERRCODE = '23514';
    END IF;

    SELECT NULLIF(TRIM(BOTH ' ' FROM COALESCE(a."first_name", '') || ' ' || COALESCE(a."last_name", '')), '')
      INTO v_actor_name
      FROM "public"."attendees" a
     WHERE a."user_id" = v_actor_id
     LIMIT 1;

    INSERT INTO "public"."audit_log"
        ("scope", "org_id", "actor_id", "actor_name", "action", "target_type", "target_id", "metadata")
    VALUES
        (p_scope, p_org_id, v_actor_id, COALESCE(v_actor_name, v_actor_id), p_action, p_target_type, p_target_id, COALESCE(p_metadata, '{}'::"jsonb"));
END;
$$;

-- Internal helper: not for direct client use. Triggers (owned by this
-- migration's role) and the RPCs below can call it regardless of grants;
-- service_role needs an explicit grant for the create-org edge function.
REVOKE EXECUTE ON FUNCTION "public"."_write_audit_log"("text","uuid","text","text","uuid","jsonb","text") FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."_write_audit_log"("text","uuid","text","text","uuid","jsonb","text") TO "service_role";


-- Triggers

-- memberships: role changed (promotion/demotion). Skips the self-service
-- pending->active status upsert since that never touches role, and skips
-- while transfer_org_ownership() is coordinating its own two-row update (see
-- the suppression flag below).
CREATE OR REPLACE FUNCTION "public"."audit_membership_role_change"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
    v_target_name "text";
BEGIN
    IF "current_setting"('audit.suppress_membership_trigger', true) = 'true' THEN
        RETURN NEW;
    END IF;

    SELECT NULLIF(TRIM(BOTH ' ' FROM COALESCE(a."first_name", '') || ' ' || COALESCE(a."last_name", '')), '')
      INTO v_target_name
      FROM "public"."attendees" a
     WHERE a."user_id" = NEW."user_id"
     LIMIT 1;

    PERFORM "public"."_write_audit_log"(
        'org', NEW."org_id", 'member.role_changed', 'membership', NULL,
        jsonb_build_object(
            'target_user_id', NEW."user_id",
            'target_name', COALESCE(v_target_name, NEW."user_id"),
            'from_role', OLD."role",
            'to_role', NEW."role"
        )
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER "audit_membership_role_change"
    AFTER UPDATE ON "public"."memberships"
    FOR EACH ROW
    WHEN (OLD."role" IS DISTINCT FROM NEW."role")
    EXECUTE FUNCTION "public"."audit_membership_role_change"();

-- memberships: member removed from the org entirely.
CREATE OR REPLACE FUNCTION "public"."audit_membership_delete"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
    v_target_name "text";
BEGIN
    SELECT NULLIF(TRIM(BOTH ' ' FROM COALESCE(a."first_name", '') || ' ' || COALESCE(a."last_name", '')), '')
      INTO v_target_name
      FROM "public"."attendees" a
     WHERE a."user_id" = OLD."user_id"
     LIMIT 1;

    PERFORM "public"."_write_audit_log"(
        'org', OLD."org_id", 'member.removed', 'membership', NULL,
        jsonb_build_object(
            'target_user_id', OLD."user_id",
            'target_name', COALESCE(v_target_name, OLD."user_id"),
            'prior_role', OLD."role"
        )
    );
    RETURN OLD;
END;
$$;

CREATE TRIGGER "audit_membership_delete"
    AFTER DELETE ON "public"."memberships"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."audit_membership_delete"();

-- meetings: deleted.
CREATE OR REPLACE FUNCTION "public"."audit_meeting_delete"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
BEGIN
    PERFORM "public"."_write_audit_log"(
        'org', OLD."org_id", 'meeting.deleted', 'meeting', OLD."id",
        jsonb_build_object('meeting_title', OLD."title")
    );
    RETURN OLD;
END;
$$;

CREATE TRIGGER "audit_meeting_delete"
    AFTER DELETE ON "public"."meetings"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."audit_meeting_delete"();

-- meetings: status toggled (open/close check-in) -- ONLY when an officer did
-- it. close_expired_meetings() (20260820000000, run by pg_cron every minute)
-- updates status through a plain SQL connection with no Clerk JWT attached,
-- so current_clerk_id() reads NULL there and this trigger no-ops. A manual
-- toggle from the admin dashboard always carries the officer's session JWT.
CREATE OR REPLACE FUNCTION "public"."audit_meeting_status_toggle"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
BEGIN
    IF "public"."current_clerk_id"() IS NULL THEN
        RETURN NEW;
    END IF;

    PERFORM "public"."_write_audit_log"(
        'org', NEW."org_id", 'meeting.status_toggled', 'meeting', NEW."id",
        jsonb_build_object('meeting_title', NEW."title", 'from_status', OLD."status", 'to_status', NEW."status")
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER "audit_meeting_status_toggle"
    AFTER UPDATE ON "public"."meetings"
    FOR EACH ROW
    WHEN (OLD."status" IS DISTINCT FROM NEW."status")
    EXECUTE FUNCTION "public"."audit_meeting_status_toggle"();

-- meetings: geo-lock settings changed. close_expired_meetings() never touches
-- these columns, so no cron-vs-officer disambiguation is needed here.
CREATE OR REPLACE FUNCTION "public"."audit_meeting_geo_lock_change"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
BEGIN
    PERFORM "public"."_write_audit_log"(
        'org', NEW."org_id", 'meeting.geo_lock_changed', 'meeting', NEW."id",
        jsonb_build_object(
            'meeting_title', NEW."title",
            'is_geo_locked', NEW."is_geo_locked",
            'radius_meters', NEW."radius_meters",
            'latitude', NEW."latitude",
            'longitude', NEW."longitude"
        )
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER "audit_meeting_geo_lock_change"
    AFTER UPDATE ON "public"."meetings"
    FOR EACH ROW
    WHEN (
        OLD."is_geo_locked" IS DISTINCT FROM NEW."is_geo_locked"
        OR OLD."radius_meters" IS DISTINCT FROM NEW."radius_meters"
        OR OLD."latitude" IS DISTINCT FROM NEW."latitude"
        OR OLD."longitude" IS DISTINCT FROM NEW."longitude"
    )
    EXECUTE FUNCTION "public"."audit_meeting_geo_lock_change"();

-- attendees: global admin flag granted/revoked. Fires after
-- attendees_admin_flag_guard (a BEFORE trigger from 20260814000000) has
-- already validated the change, so this only ever logs changes that were
-- actually allowed to happen.
CREATE OR REPLACE FUNCTION "public"."audit_admin_flag_change"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
    v_target_name "text";
BEGIN
    v_target_name := NULLIF(TRIM(BOTH ' ' FROM COALESCE(NEW."first_name", '') || ' ' || COALESCE(NEW."last_name", '')), '');

    PERFORM "public"."_write_audit_log"(
        'platform', NULL,
        CASE WHEN COALESCE(NEW."admin", false) THEN 'admin.granted' ELSE 'admin.revoked' END,
        'attendee', NEW."id",
        jsonb_build_object('target_user_id', NEW."user_id", 'target_name', COALESCE(v_target_name, NEW."user_id"))
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER "audit_admin_flag_change"
    AFTER UPDATE ON "public"."attendees"
    FOR EACH ROW
    WHEN (COALESCE(OLD."admin", false) IS DISTINCT FROM COALESCE(NEW."admin", false))
    EXECUTE FUNCTION "public"."audit_admin_flag_change"();


-- ---------------------------------------------------------------------------
-- 5. RPCs for actions no trigger can see
-- ---------------------------------------------------------------------------

-- Attendance CSV export is pure client-side formatting of already-fetched
-- rows (lib/attendance-csv.ts) -- no row changes for a trigger to catch. The
-- admin dashboard calls this right after downloadCsv().
CREATE OR REPLACE FUNCTION "public"."log_attendance_export"("p_meeting_id" "uuid", "p_row_count" integer)
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
    v_org_id "uuid";
    v_title "text";
BEGIN
    SELECT m."org_id", m."title" INTO v_org_id, v_title
    FROM "public"."meetings" m
    WHERE m."id" = p_meeting_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'meeting not found' USING ERRCODE = '22023';
    END IF;

    IF NOT "public"."is_org_officer"(v_org_id) THEN
        RAISE EXCEPTION 'not authorized to export this meeting''s attendance' USING ERRCODE = '42501';
    END IF;

    PERFORM "public"."_write_audit_log"(
        'org', v_org_id, 'attendance.exported', 'meeting', p_meeting_id,
        jsonb_build_object('meeting_title', v_title, 'row_count', p_row_count)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."log_attendance_export"("uuid", integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."log_attendance_export"("uuid", integer) TO "authenticated";

-- Ownership transfer is two membership updates that should read as one
-- event. It suppresses audit_membership_role_change for the duration (via a
-- session-local GUC) and writes a single combined entry instead.
CREATE OR REPLACE FUNCTION "public"."transfer_org_ownership"("p_org_id" "uuid", "p_new_owner_user_id" "text")
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
    v_old_owner_id "text";
    v_old_owner_name "text";
    v_new_owner_name "text";
BEGIN
    IF NOT "public"."has_org_role"(p_org_id, ARRAY['owner']) THEN
        RAISE EXCEPTION 'only the current owner may transfer ownership' USING ERRCODE = '42501';
    END IF;

    SELECT m."user_id" INTO v_old_owner_id
    FROM "public"."memberships" m
    WHERE m."org_id" = p_org_id AND m."role" = 'owner'
    LIMIT 1;

    IF v_old_owner_id IS NULL THEN
        RAISE EXCEPTION 'organization has no current owner' USING ERRCODE = '22023';
    END IF;

    IF v_old_owner_id = p_new_owner_user_id THEN
        RAISE EXCEPTION 'new owner must be a different member' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "public"."memberships"
        WHERE "org_id" = p_org_id AND "user_id" = p_new_owner_user_id
    ) THEN
        RAISE EXCEPTION 'new owner must already be a member of this organization' USING ERRCODE = '22023';
    END IF;

    PERFORM "set_config"('audit.suppress_membership_trigger', 'true', true);

    UPDATE "public"."memberships" SET "role" = 'officer'
     WHERE "org_id" = p_org_id AND "user_id" = v_old_owner_id;

    UPDATE "public"."memberships" SET "role" = 'owner'
     WHERE "org_id" = p_org_id AND "user_id" = p_new_owner_user_id;

    PERFORM "set_config"('audit.suppress_membership_trigger', 'false', true);

    SELECT NULLIF(TRIM(BOTH ' ' FROM COALESCE(a."first_name", '') || ' ' || COALESCE(a."last_name", '')), '')
      INTO v_old_owner_name FROM "public"."attendees" a WHERE a."user_id" = v_old_owner_id LIMIT 1;
    SELECT NULLIF(TRIM(BOTH ' ' FROM COALESCE(a."first_name", '') || ' ' || COALESCE(a."last_name", '')), '')
      INTO v_new_owner_name FROM "public"."attendees" a WHERE a."user_id" = p_new_owner_user_id LIMIT 1;

    PERFORM "public"."_write_audit_log"(
        'org', p_org_id, 'org.ownership_transferred', 'organization', p_org_id,
        jsonb_build_object(
            'from_user_id', v_old_owner_id, 'from_name', COALESCE(v_old_owner_name, v_old_owner_id),
            'to_user_id', p_new_owner_user_id, 'to_name', COALESCE(v_new_owner_name, p_new_owner_user_id)
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."transfer_org_ownership"("uuid", "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."transfer_org_ownership"("uuid", "text") TO "authenticated";

-- Member management: invite by email, promote/demote, remove, manual
-- attendance entry, plus a new 'co-owner' role tier and org branding editing.
--
-- Confirmed permission matrix (see conversation, not re-derivable from code):
--   officer:  promote member->officer, remove member only.
--   co-owner: everything officer can do, PLUS promote member/officer->co-owner,
--             remove officer, remove co-owner (including peers), demote
--             officer/co-owner in either direction, view the org audit log,
--             edit org branding.
--   owner:    everything co-owner can do, PLUS transfer the singular 'owner'
--             role (steps self down to co-owner in the same transaction).
--   Removing an 'owner' row is admin-only (attendees.admin) -- not even the
--   owner/co-owner tier can do it. This is the only way an org goes
--   ownerless; there is no self-service "abandon ownership" path.


-- ---------------------------------------------------------------------------
-- 1. Wire 'co-owner' through existing helpers
-- ---------------------------------------------------------------------------

-- Cascades co-owner into every policy that already calls is_org_officer()
-- (meetings CRUD, attendance read/insert, member reads) without touching
-- those policies individually.
CREATE OR REPLACE FUNCTION "public"."is_org_officer"("p_org_id" "uuid")
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = "public"
AS $$
    SELECT "public"."has_org_role"(p_org_id, ARRAY['officer', 'co-owner', 'owner']);
$$;

-- DB-level guarantee that an org can never end up with two owners. Safe
-- against existing data: create-org has only ever produced one owner per org.
CREATE UNIQUE INDEX "memberships_single_owner_per_org"
    ON "public"."memberships" ("org_id")
    WHERE ("role" = 'owner');

-- Co-owners get audit log read access alongside owners.
DROP POLICY IF EXISTS "audit_owner_read" ON "public"."audit_log";
CREATE POLICY "audit_owner_read" ON "public"."audit_log"
    FOR SELECT TO "authenticated"
    USING ("scope" = 'org' AND "public"."has_org_role"("org_id", ARRAY['owner', 'co-owner']));

-- Drop the dead 'admin' per-org-role literal left over from before the
-- global-admin refactor in 20260822000000 (has_org_role already folds in
-- is_global_admin() internally -- passing 'admin' as a role string here never
-- matched anything real). These stay owner-only as a raw-table fallback;
-- officer/co-owner mutations go through the RPCs below (SECURITY DEFINER,
-- bypass RLS), not through these policies.
DROP POLICY IF EXISTS "memberships_officer_insert" ON "public"."memberships";
CREATE POLICY "memberships_officer_insert" ON "public"."memberships"
    FOR INSERT TO "authenticated"
    WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner']));

DROP POLICY IF EXISTS "memberships_officer_update" ON "public"."memberships";
CREATE POLICY "memberships_officer_update" ON "public"."memberships"
    FOR UPDATE TO "authenticated"
    USING ("public"."has_org_role"("org_id", ARRAY['owner']))
    WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner']));

-- Same cleanup for org branding updates, plus extending it to co-owner.
DROP POLICY IF EXISTS "orgs_officer_update" ON "public"."organizations";
CREATE POLICY "orgs_officer_update" ON "public"."organizations"
    FOR UPDATE TO "authenticated"
    USING ("public"."has_org_role"("id", ARRAY['owner', 'co-owner']))
    WITH CHECK ("public"."has_org_role"("id", ARRAY['owner', 'co-owner']));


-- ---------------------------------------------------------------------------
-- 2. Small internal helpers used by the RPCs below
-- ---------------------------------------------------------------------------

-- The caller's authority in p_org_id for permission-matrix purposes. A global
-- admin is always treated as 'owner' -- consistent with how has_org_role()
-- already lets is_global_admin() bypass every per-org check.
CREATE OR REPLACE FUNCTION "public"."_effective_org_role"("p_org_id" "uuid")
RETURNS "text"
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = "public"
AS $$
    SELECT CASE
        WHEN "public"."is_global_admin"() THEN 'owner'
        ELSE (
            SELECT m."role" FROM "public"."memberships" m
            WHERE m."org_id" = p_org_id AND m."user_id" = "public"."current_clerk_id"()
            LIMIT 1
        )
    END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."_effective_org_role"("uuid") FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION "public"."_role_level"("p_role" "text")
RETURNS integer
LANGUAGE "sql"
IMMUTABLE
AS $$
    SELECT CASE p_role
        WHEN 'member' THEN 0
        WHEN 'officer' THEN 1
        WHEN 'co-owner' THEN 2
        WHEN 'owner' THEN 3
        ELSE -1
    END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."_role_level"("text") FROM PUBLIC, "anon", "authenticated";


-- ---------------------------------------------------------------------------
-- 3. Rework transfer_org_ownership: steps the old owner down to 'co-owner'
--    (not 'officer'), and lets a global admin (re)assign an owner to an org
--    that currently has none -- the only path back from an admin-forced
--    owner removal (see remove_org_member below).
-- ---------------------------------------------------------------------------

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
    v_is_admin boolean := "public"."is_global_admin"();
BEGIN
    IF NOT v_is_admin AND NOT "public"."has_org_role"(p_org_id, ARRAY['owner']) THEN
        RAISE EXCEPTION 'only the current owner may transfer ownership' USING ERRCODE = '42501';
    END IF;

    SELECT m."user_id" INTO v_old_owner_id
    FROM "public"."memberships" m
    WHERE m."org_id" = p_org_id AND m."role" = 'owner'
    LIMIT 1;

    IF v_old_owner_id IS NULL AND NOT v_is_admin THEN
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

    IF v_old_owner_id IS NOT NULL THEN
        UPDATE "public"."memberships" SET "role" = 'co-owner'
         WHERE "org_id" = p_org_id AND "user_id" = v_old_owner_id;
    END IF;

    UPDATE "public"."memberships" SET "role" = 'owner'
     WHERE "org_id" = p_org_id AND "user_id" = p_new_owner_user_id;

    PERFORM "set_config"('audit.suppress_membership_trigger', 'false', true);

    IF v_old_owner_id IS NOT NULL THEN
        SELECT NULLIF(TRIM(BOTH ' ' FROM COALESCE(a."first_name", '') || ' ' || COALESCE(a."last_name", '')), '')
          INTO v_old_owner_name FROM "public"."attendees" a WHERE a."user_id" = v_old_owner_id LIMIT 1;
    END IF;
    SELECT NULLIF(TRIM(BOTH ' ' FROM COALESCE(a."first_name", '') || ' ' || COALESCE(a."last_name", '')), '')
      INTO v_new_owner_name FROM "public"."attendees" a WHERE a."user_id" = p_new_owner_user_id LIMIT 1;

    PERFORM "public"."_write_audit_log"(
        'org', p_org_id, 'org.ownership_transferred', 'organization', p_org_id,
        jsonb_build_object(
            'from_user_id', v_old_owner_id,
            'from_name', COALESCE(v_old_owner_name, v_old_owner_id),
            'to_user_id', p_new_owner_user_id,
            'to_name', COALESCE(v_new_owner_name, p_new_owner_user_id)
        )
    );
END;
$$;


-- ---------------------------------------------------------------------------
-- 4. invite_org_member -- add someone by email. Requires an existing account
--    (attendees.user_id already set); no pre-signup invite mechanism.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."invite_org_member"("p_org_id" "uuid", "p_email" "text", "p_role" "text")
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
    v_caller_level integer := "public"."_role_level"("public"."_effective_org_role"(p_org_id));
    v_target_user_id "text";
    v_normalized_email "text" := lower(trim(p_email));
BEGIN
    IF p_role NOT IN ('member', 'officer', 'co-owner') THEN
        RAISE EXCEPTION 'invalid role: %', p_role USING ERRCODE = '22023';
    END IF;

    IF v_caller_level < 1 OR "public"."_role_level"(p_role) > v_caller_level THEN
        RAISE EXCEPTION 'not authorized to invite a member at that role' USING ERRCODE = '42501';
    END IF;

    SELECT a."user_id" INTO v_target_user_id
    FROM "public"."attendees" a
    WHERE lower(a."email") = v_normalized_email
      AND a."user_id" IS NOT NULL
    LIMIT 1;

    IF v_target_user_id IS NULL THEN
        RAISE EXCEPTION 'no registered account found for that email yet' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "public"."memberships"
        WHERE "org_id" = p_org_id AND "user_id" = v_target_user_id
    ) THEN
        RAISE EXCEPTION 'this person is already a member of the organization' USING ERRCODE = '22023';
    END IF;

    INSERT INTO "public"."memberships" ("org_id", "user_id", "role", "status")
    VALUES (p_org_id, v_target_user_id, p_role, 'active');

    PERFORM "public"."_write_audit_log"(
        'org', p_org_id, 'member.invited', 'membership', NULL,
        jsonb_build_object('target_user_id', v_target_user_id, 'target_email', v_normalized_email, 'role', p_role)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."invite_org_member"("uuid", "text", "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."invite_org_member"("uuid", "text", "text") TO "authenticated";


-- ---------------------------------------------------------------------------
-- 5. set_member_role -- promote or demote among member/officer/co-owner.
--    'owner' is never a valid target here; that transition is exclusively
--    transfer_org_ownership's job. The memberships role-change trigger (from
--    the previous migration) logs this automatically in either direction.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."set_member_role"("p_org_id" "uuid", "p_target_user_id" "text", "p_new_role" "text")
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
    v_caller_level integer := "public"."_role_level"("public"."_effective_org_role"(p_org_id));
    v_current_role "text";
    v_current_level integer;
    v_new_level integer := "public"."_role_level"(p_new_role);
BEGIN
    IF p_new_role NOT IN ('member', 'officer', 'co-owner') THEN
        RAISE EXCEPTION 'invalid role: %', p_new_role USING ERRCODE = '22023';
    END IF;

    SELECT m."role" INTO v_current_role
    FROM "public"."memberships" m
    WHERE m."org_id" = p_org_id AND m."user_id" = p_target_user_id;

    IF v_current_role IS NULL THEN
        RAISE EXCEPTION 'target is not a member of this organization' USING ERRCODE = '22023';
    END IF;

    IF v_current_role = 'owner' THEN
        RAISE EXCEPTION 'the owner''s role can only change via transfer_org_ownership' USING ERRCODE = '42501';
    END IF;

    v_current_level := "public"."_role_level"(v_current_role);

    IF v_new_level = v_current_level THEN
        RETURN;
    ELSIF v_new_level > v_current_level THEN
        -- Promotion: officers may promote up to officer only; co-owner/owner
        -- may promote up to co-owner.
        IF v_caller_level < 1 OR v_new_level > v_caller_level THEN
            RAISE EXCEPTION 'not authorized to promote to that role' USING ERRCODE = '42501';
        END IF;
    ELSE
        -- Demotion: officers cannot demote at all.
        IF v_caller_level < 2 THEN
            RAISE EXCEPTION 'not authorized to demote members' USING ERRCODE = '42501';
        END IF;
    END IF;

    UPDATE "public"."memberships" SET "role" = p_new_role
    WHERE "org_id" = p_org_id AND "user_id" = p_target_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."set_member_role"("uuid", "text", "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."set_member_role"("uuid", "text", "text") TO "authenticated";


-- ---------------------------------------------------------------------------
-- 6. remove_org_member -- not a clean formula (co-owners may remove co-owner
--    peers; officers may not remove officer peers), so branches explicitly
--    per target role. Removing an owner is admin-only. The memberships
--    delete trigger (from the previous migration) logs member.removed
--    automatically.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."remove_org_member"("p_org_id" "uuid", "p_target_user_id" "text")
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
    v_caller_role "text" := "public"."_effective_org_role"(p_org_id);
    v_target_role "text";
BEGIN
    SELECT m."role" INTO v_target_role
    FROM "public"."memberships" m
    WHERE m."org_id" = p_org_id AND m."user_id" = p_target_user_id;

    IF v_target_role IS NULL THEN
        RAISE EXCEPTION 'target is not a member of this organization' USING ERRCODE = '22023';
    END IF;

    IF v_target_role = 'owner' THEN
        IF NOT "public"."is_global_admin"() THEN
            RAISE EXCEPTION 'only a global admin may remove an owner' USING ERRCODE = '42501';
        END IF;
    ELSIF v_target_role IN ('co-owner', 'officer') THEN
        IF v_caller_role NOT IN ('co-owner', 'owner') THEN
            RAISE EXCEPTION 'not authorized to remove a %', v_target_role USING ERRCODE = '42501';
        END IF;
    ELSE -- member
        IF v_caller_role NOT IN ('officer', 'co-owner', 'owner') THEN
            RAISE EXCEPTION 'not authorized to remove a member' USING ERRCODE = '42501';
        END IF;
    END IF;

    DELETE FROM "public"."memberships"
    WHERE "org_id" = p_org_id AND "user_id" = p_target_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."remove_org_member"("uuid", "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."remove_org_member"("uuid", "text") TO "authenticated";


-- ---------------------------------------------------------------------------
-- 7. officer_manual_checkin -- mark a member as attended without them
--    checking in. No geolocation logic is invoked at all (this never goes
--    through checkin/geolock.ts or the client check-in flow), so bypassing
--    geolocation falls out naturally rather than needing special-cased code.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."officer_manual_checkin"("p_meeting_id" "uuid", "p_target_user_id" "text")
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
    v_org_id "uuid";
    v_meeting_title "text";
    v_attendee_id "uuid";
    v_target_name "text";
BEGIN
    SELECT m."org_id", m."title" INTO v_org_id, v_meeting_title
    FROM "public"."meetings" m
    WHERE m."id" = p_meeting_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'meeting not found' USING ERRCODE = '22023';
    END IF;

    IF NOT "public"."is_org_officer"(v_org_id) THEN
        RAISE EXCEPTION 'not authorized to record attendance for this meeting' USING ERRCODE = '42501';
    END IF;

    SELECT a."id", NULLIF(TRIM(BOTH ' ' FROM COALESCE(a."first_name", '') || ' ' || COALESCE(a."last_name", '')), '')
      INTO v_attendee_id, v_target_name
      FROM "public"."attendees" a
     WHERE a."user_id" = p_target_user_id;

    IF v_attendee_id IS NULL THEN
        RAISE EXCEPTION 'no attendee profile found for that member' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "public"."attendance"
        WHERE "meeting_id" = p_meeting_id AND "attendee_id" = v_attendee_id
    ) THEN
        RAISE EXCEPTION 'this member is already checked in to this meeting' USING ERRCODE = '22023';
    END IF;

    INSERT INTO "public"."attendance" ("org_id", "attendee_id", "meeting_id", "source", "answers")
    VALUES (v_org_id, v_attendee_id, p_meeting_id, 'officer_manual', NULL);

    PERFORM "public"."_write_audit_log"(
        'org', v_org_id, 'attendance.manual_entry', 'meeting', p_meeting_id,
        jsonb_build_object(
            'meeting_title', v_meeting_title,
            'target_user_id', p_target_user_id,
            'target_name', COALESCE(v_target_name, p_target_user_id)
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."officer_manual_checkin"("uuid", "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."officer_manual_checkin"("uuid", "text") TO "authenticated";

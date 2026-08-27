-- Restrict officer/co-owner APPOINTMENT to global admins (and, for plain
-- officers only, the org owner).
--
-- WHY THIS NARROWS EXISTING POWERS
-- --------------------------------
-- The matrix set in 20260824000000 let anyone at officer level or above
-- appoint upward within their own ceiling: an officer could promote a member
-- to officer, and a co-owner could mint more co-owners. That made the officer
-- corps self-replicating -- a single compromised or careless officer account
-- could expand the officer roster indefinitely, and nothing at the platform
-- level gated who gains administrative access to a club.
--
-- Appointment is now a platform-level act:
--
--   promote/invite -> 'officer':    owner, or global admin
--   promote/invite -> 'co-owner':   global admin ONLY
--   transfer 'owner':               current owner (succession), or global admin
--   promote/invite -> 'member':     unchanged (officer and above)
--
-- Note the asymmetry with DEMOTION and REMOVAL, which are deliberately left
-- exactly as they were (co-owner+ may demote, officer may remove members).
-- Taking authority away stays locally available so a club can respond to a
-- problem immediately; only GRANTING authority is centralized. A club that
-- demotes its last officer by mistake needs an admin to restore them, which is
-- the intended direction for that error to fail in.
--
-- SUCCESSION IS PRESERVED
-- -----------------------
-- transfer_org_ownership is untouched: a president hands the org to their
-- successor without an admin in the loop, which is the one appointment path
-- clubs must be able to run on their own schedule (elections don't wait). The
-- outgoing owner still steps down to co-owner in the same transaction, so the
-- transfer neither creates nor destroys a co-owner seat -- it moves one.
--
-- WHY 'owner' MAY STILL APPOINT OFFICERS
-- --------------------------------------
-- Requiring an admin for every routine officer appointment would make the
-- platform owner a bottleneck for ordinary club operations. The owner is the
-- one role that is itself admin-granted or inherited through a recorded
-- succession, so letting it staff its own officer corps does not create the
-- self-replication problem above: the officer tier cannot grow itself, and the
-- co-owner tier -- which carries demotion and removal authority -- is
-- admin-only regardless.


-- ---------------------------------------------------------------------------
-- 1. Appointment ceiling helper.
--
-- The highest role the caller may appoint SOMEONE ELSE into, as a level (see
-- _role_level). -1 means "may not appoint at all". Deliberately distinct from
-- _effective_org_role: authority to hold a role and authority to grant it are
-- now different things, and every appointment path must consult this one
-- function so the two RPCs below cannot drift apart.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."_appointment_ceiling"("p_org_id" "uuid")
RETURNS integer
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = "public"
AS $$
    SELECT CASE
        -- Global admin: may appoint up to co-owner. Still not 'owner' --
        -- ownership only moves through transfer_org_ownership, which keeps the
        -- single-owner index and the succession audit trail intact.
        WHEN "public"."is_global_admin"() THEN 2
        -- Owner: may staff officers, may not mint co-owners.
        WHEN EXISTS (
            SELECT 1 FROM "public"."memberships" m
            WHERE m."org_id" = p_org_id
              AND m."user_id" = "public"."current_clerk_id"()
              AND m."role" = 'owner'
        ) THEN 1
        -- Officer and co-owner may still add plain members.
        WHEN EXISTS (
            SELECT 1 FROM "public"."memberships" m
            WHERE m."org_id" = p_org_id
              AND m."user_id" = "public"."current_clerk_id"()
              AND m."role" IN ('officer', 'co-owner')
        ) THEN 0
        ELSE -1
    END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."_appointment_ceiling"("uuid") FROM PUBLIC, "anon", "authenticated";


-- ---------------------------------------------------------------------------
-- 2. invite_org_member -- same behavior, appointment ceiling applied.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."invite_org_member"("p_org_id" "uuid", "p_email" "text", "p_role" "text")
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
    v_ceiling integer := "public"."_appointment_ceiling"(p_org_id);
    v_target_user_id "text";
    v_normalized_email "text" := lower(trim(p_email));
BEGIN
    IF p_role NOT IN ('member', 'officer', 'co-owner') THEN
        RAISE EXCEPTION 'invalid role: %', p_role USING ERRCODE = '22023';
    END IF;

    IF v_ceiling < 0 THEN
        RAISE EXCEPTION 'not authorized to add members to this organization' USING ERRCODE = '42501';
    END IF;

    IF "public"."_role_level"(p_role) > v_ceiling THEN
        -- Distinct messages: "ask an admin" is actionable, a generic refusal is
        -- not, and this is the error officers will hit most often.
        IF p_role = 'co-owner' THEN
            RAISE EXCEPTION 'only a global admin may appoint a co-owner' USING ERRCODE = '42501';
        ELSE
            RAISE EXCEPTION 'only the owner or a global admin may appoint an officer' USING ERRCODE = '42501';
        END IF;
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
-- 3. set_member_role -- promotion now uses the appointment ceiling; demotion
--    keeps the old _effective_org_role rule untouched.
--
-- Carries forward the admin-only owner-demotion branch from
-- 20260825000000_admin_demote_owner.sql; that migration and this one both
-- CREATE OR REPLACE the same function, so this body must remain a superset.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."set_member_role"("p_org_id" "uuid", "p_target_user_id" "text", "p_new_role" "text")
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
    v_caller_level integer := "public"."_role_level"("public"."_effective_org_role"(p_org_id));
    v_ceiling integer := "public"."_appointment_ceiling"(p_org_id);
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

    IF v_current_role = 'owner' AND NOT "public"."is_global_admin"() THEN
        RAISE EXCEPTION 'the owner''s role can only change via transfer_org_ownership, or by a global admin' USING ERRCODE = '42501';
    END IF;

    v_current_level := "public"."_role_level"(v_current_role);

    IF v_new_level = v_current_level THEN
        RETURN;
    ELSIF v_new_level > v_current_level THEN
        -- PROMOTION is appointment: gated on the ceiling, not on the caller's
        -- own rank. An officer promoting a member to officer no longer passes.
        IF v_new_level > v_ceiling THEN
            IF p_new_role = 'co-owner' THEN
                RAISE EXCEPTION 'only a global admin may appoint a co-owner' USING ERRCODE = '42501';
            ELSE
                RAISE EXCEPTION 'only the owner or a global admin may appoint an officer' USING ERRCODE = '42501';
            END IF;
        END IF;
    ELSE
        -- DEMOTION is unchanged: co-owner and above, per the original matrix.
        -- Demoting an owner is already gated above to admins only, who reach
        -- here with v_caller_level = 3 and so always pass this check too.
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
-- 4. Expose the caller's own membership row for display.
--
-- A global admin is implicitly treated as 'owner' everywhere (has_org_role,
-- _effective_org_role), which means the dashboard cannot tell "admin visiting
-- a club" apart from "admin who is genuinely an officer of this club". Both
-- read as owner. This returns the LITERAL memberships row -- no admin
-- substitution -- so the UI can show an admin their real club role while their
-- platform authority stays exactly as it was.
--
-- SECURITY DEFINER only to keep it independent of the memberships policies;
-- it is hard-scoped to the caller's own row and takes no user id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."my_org_membership"("p_org_id" "uuid")
RETURNS TABLE ("role" "text", "status" "text", "is_global_admin" boolean)
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = "public"
AS $$
    SELECT
        m."role",
        m."status",
        "public"."is_global_admin"()
    FROM "public"."memberships" m
    WHERE m."org_id" = p_org_id
      AND m."user_id" = "public"."current_clerk_id"()
    UNION ALL
    -- No membership row: still report the admin flag, with a NULL club role.
    -- Without this branch an admin with no membership gets zero rows and the
    -- caller cannot distinguish "not a member" from "query failed".
    SELECT NULL, NULL, "public"."is_global_admin"()
    WHERE NOT EXISTS (
        SELECT 1 FROM "public"."memberships" m2
        WHERE m2."org_id" = p_org_id
          AND m2."user_id" = "public"."current_clerk_id"()
    )
    LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION "public"."my_org_membership"("uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."my_org_membership"("uuid") TO "authenticated";

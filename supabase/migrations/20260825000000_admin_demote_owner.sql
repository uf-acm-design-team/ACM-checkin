-- Allow a global admin to demote an 'owner' via set_member_role, without
-- also having to name a replacement in the same call (that's what
-- transfer_org_ownership is for -- this is the other half: an admin
-- stepping in to demote a problem owner, same tier of authority as the
-- existing admin-only removal path in remove_org_member). Regular
-- owners/co-owners still cannot touch an owner row this way -- only admins.
--
-- This intentionally can leave an org ownerless, same as admin-forced
-- removal already does; transfer_org_ownership's admin-recovery branch
-- (added in 20260824000000) is how a new owner gets assigned afterward.

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

    IF v_current_role = 'owner' AND NOT "public"."is_global_admin"() THEN
        RAISE EXCEPTION 'the owner''s role can only change via transfer_org_ownership, or by a global admin' USING ERRCODE = '42501';
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
        -- Demotion: officers cannot demote at all. Demoting an owner is
        -- already gated above to admins only, who reach here with
        -- v_caller_level = 3 and so always pass this check too.
        IF v_caller_level < 2 THEN
            RAISE EXCEPTION 'not authorized to demote members' USING ERRCODE = '42501';
        END IF;
    END IF;

    UPDATE "public"."memberships" SET "role" = p_new_role
    WHERE "org_id" = p_org_id AND "user_id" = p_target_user_id;
END;
$$;

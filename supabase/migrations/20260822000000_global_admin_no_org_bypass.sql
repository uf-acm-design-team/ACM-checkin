-- Developer/global admins are a platform-level superuser. They are allowed to
-- access any org route for testing and maintenance, but regular users still
-- need an explicit membership row for a given org.
--

CREATE OR REPLACE FUNCTION "public"."has_org_role"("p_org_id" "uuid", "p_roles" "text"[])
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = "public"
AS $$
    SELECT "public"."is_global_admin"()
        OR EXISTS (
            SELECT 1 FROM "public"."memberships" m
            WHERE m."user_id" = "public"."current_clerk_id"()
              AND m."org_id" = p_org_id
              AND m."role" = ANY(p_roles)
        );
$$;

CREATE OR REPLACE FUNCTION "public"."is_org_officer"("p_org_id" "uuid")
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = "public"
AS $$
    SELECT "public"."has_org_role"(p_org_id, ARRAY['officer', 'owner']);
$$;

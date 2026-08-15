-- Move the global-admin signal from memberships.role='admin' to attendees.admin.
--
-- 20260813000100 treated a memberships row with role='admin' as a global admin.
-- The app gates its admin-only UI on attendees.admin instead (the Orgs tab in
-- app/[orgSlug]/adminDashboard/page.tsx), so the UI and the database disagreed:
-- a user with attendees.admin = true would see the "create org" control and
-- then get a permission error on submit, while a user with an 'admin'
-- membership row could create orgs without the UI ever offering it.
--
-- attendees.admin wins because global admin is a property of the person, not of
-- their relationship to one organization -- which is exactly what a row in
-- memberships (PK: org_id, user_id) models. Encoding a global capability there
-- always meant picking an arbitrary org to hang it on.
--
-- After this migration:
--   attendees.admin = true  -> global admin: bypasses every org-scoped check
--   memberships.role        -> per-org only: 'member' | 'officer' | 'owner'
--
-- 'admin' as a memberships.role value is no longer meaningful. Existing rows
-- are migrated to attendees.admin below rather than dropped, so nobody
-- silently loses access.


-- Carry any existing global admins over to the new signal before the semantics
-- change. Matches on the Clerk id, which both tables key by (memberships.user_id
-- is text since 20260518000200).
UPDATE "public"."attendees" a
   SET "admin" = true
  FROM "public"."memberships" m
 WHERE m."user_id" = a."user_id"
   AND m."role" = 'admin'
   AND COALESCE(a."admin", false) = false;

-- Demote the now-meaningless 'admin' role to 'owner' so those users keep
-- officer-level access to the org the row pointed at. Their global powers now
-- come from attendees.admin, set above.
UPDATE "public"."memberships"
   SET "role" = 'owner'
 WHERE "role" = 'admin';


-- Is the caller a global admin? Reads attendees.admin via the Clerk id.
--
-- SECURITY DEFINER: the attendees policies restrict a user to their own row,
-- and several of those policies call this function -- without DEFINER the
-- lookup would be filtered by the very policies it informs, and recurse.
CREATE OR REPLACE FUNCTION "public"."is_global_admin"()
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = "public"
AS $$
    SELECT EXISTS (
        SELECT 1 FROM "public"."attendees" a
        WHERE a."user_id" = "public"."current_clerk_id"()
          AND COALESCE(a."admin", false) = true
    );
$$;

REVOKE EXECUTE ON FUNCTION "public"."is_global_admin"() FROM "public";
GRANT EXECUTE ON FUNCTION "public"."is_global_admin"() TO "anon", "authenticated";


-- Redefine the org-role check: global admin now comes from attendees.admin,
-- and memberships is consulted only for the org named by p_org_id.
--
-- Every policy from 20260813000100 calls this (directly or via is_org_officer),
-- so replacing it here updates the whole authorization surface at once -- no
-- policy bodies need to change.
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


-- orgs_admin_insert previously read has_org_role(id, ARRAY['admin']), which
-- after the change above would look for a per-org role literally named 'admin'
-- -- a value that no longer exists. Point it at the global flag directly.
DROP POLICY IF EXISTS "orgs_admin_insert" ON "public"."organizations";

CREATE POLICY "orgs_admin_insert" ON "public"."organizations"
    FOR INSERT TO "authenticated"
    WITH CHECK ("public"."is_global_admin"());


-- Global admins need to read every attendee row (the admin console lists
-- people across orgs). The existing attendees_read_own / attendees_officer_read
-- policies are org-scoped; this adds the global escape hatch as its own
-- permissive policy rather than complicating those.
CREATE POLICY "attendees_admin_read" ON "public"."attendees"
    FOR SELECT TO "authenticated"
    USING ("public"."is_global_admin"());

-- And to set/revoke the admin flag on others -- otherwise the first admin can
-- never appoint a second one without service_role access.
CREATE POLICY "attendees_admin_update" ON "public"."attendees"
    FOR UPDATE TO "authenticated"
    USING ("public"."is_global_admin"())
    WITH CHECK ("public"."is_global_admin"());


-- Protect the admin column itself.
--
-- attendees.admin is now a privilege grant, but attendees_update_own (from
-- 20260813000100) lets a user update their OWN row -- and RLS policies apply to
-- the whole row, not individual columns. Without the trigger below, any signed-in
-- user could run
--     update attendees set admin = true where user_id = <their own id>
-- and become a global admin. Verified: this succeeded before the trigger existed.
--
-- A BEFORE UPDATE trigger is the fix, since Postgres RLS cannot express
-- column-level rules. Column privileges (REVOKE UPDATE(admin)) were the other
-- option, but they don't compose with PostgREST's row-level writes as cleanly:
-- the trigger reports a clear error and still lets an admin change the flag.
CREATE OR REPLACE FUNCTION "public"."enforce_admin_flag_change"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
BEGIN
    IF COALESCE(NEW."admin", false) IS DISTINCT FROM COALESCE(OLD."admin", false)
       AND NOT "public"."is_global_admin"() THEN
        RAISE EXCEPTION 'only a global admin may change attendees.admin'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "attendees_admin_flag_guard"
    BEFORE UPDATE ON "public"."attendees"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."enforce_admin_flag_change"();

-- Same hole on INSERT: guest/self-insert policies would otherwise let a new
-- row be created with admin = true.
CREATE OR REPLACE FUNCTION "public"."enforce_admin_flag_insert"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
BEGIN
    IF COALESCE(NEW."admin", false) = true AND NOT "public"."is_global_admin"() THEN
        RAISE EXCEPTION 'only a global admin may create an admin attendee'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "attendees_admin_flag_insert_guard"
    BEFORE INSERT ON "public"."attendees"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."enforce_admin_flag_insert"();

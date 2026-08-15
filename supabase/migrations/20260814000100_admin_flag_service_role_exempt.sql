-- Let service_role change attendees.admin (dashboard administration).
--
-- 20260814000000 added enforce_admin_flag_change() to stop privilege
-- escalation: without it any signed-in user could run
--     update attendees set admin = true where user_id = <their own id>
-- and become a global admin, because RLS is row-level and cannot restrict a
-- single column.
--
-- That guard was too broad. Triggers fire for EVERY role including
-- service_role -- BYPASSRLS skips row-level policies, not triggers. So the
-- Supabase dashboard (both the table editor and the SQL editor run as
-- service_role) could not toggle the flag, making it impossible to bootstrap
-- the first admin or to administer the table by hand.
--
-- Exempting service_role is safe: it is already a full-bypass credential that
-- must never reach a browser, and anyone holding it could drop the trigger
-- anyway. The guard still applies to `authenticated` and `anon` -- the roles an
-- attacker can actually reach.
--
-- ---------------------------------------------------------------------------
-- WHY SECURITY INVOKER (this is load-bearing, do not "fix" it back to DEFINER):
--
-- Supabase assumes a role via SET ROLE on a shared connection, so:
--   * session_user  reports the LOGIN role (postgres), never service_role
--   * current_user  under SECURITY DEFINER is rewritten to the function OWNER,
--                   also masking the caller
--
-- Verified empirically -- with SET ROLE service_role, a SECURITY DEFINER
-- trigger sees session_user=postgres current_user=postgres, while a
-- SECURITY INVOKER trigger correctly sees current_user=service_role.
--
-- So the trigger functions must be SECURITY INVOKER to identify the caller.
-- They can still call is_global_admin(), which stays SECURITY DEFINER so its
-- own attendees lookup is not filtered by the attendees policies.

CREATE OR REPLACE FUNCTION "public"."enforce_admin_flag_change"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY INVOKER
SET "search_path" = "public"
AS $$
BEGIN
    -- Dashboard / server-side administration bypasses the guard.
    IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
        RETURN NEW;
    END IF;

    IF COALESCE(NEW."admin", false) IS DISTINCT FROM COALESCE(OLD."admin", false)
       AND NOT "public"."is_global_admin"() THEN
        RAISE EXCEPTION 'only a global admin may change attendees.admin'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."enforce_admin_flag_insert"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY INVOKER
SET "search_path" = "public"
AS $$
BEGIN
    IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
        RETURN NEW;
    END IF;

    IF COALESCE(NEW."admin", false) = true AND NOT "public"."is_global_admin"() THEN
        RAISE EXCEPTION 'only a global admin may create an admin attendee'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

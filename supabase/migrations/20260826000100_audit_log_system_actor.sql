-- Let audit-logged writes succeed when there is no Clerk actor.
--
-- _write_audit_log resolves the actor from current_clerk_id(), i.e.
-- `auth.jwt() ->> 'sub'`. A direct database connection -- the Supabase SQL
-- editor, the table editor, a migration, a psql session -- carries no Clerk
-- JWT, so that returned NULL and the function raised
--     23514 audit log entry requires an actor
-- which aborted the whole statement, since the audit write happens in a
-- trigger. Toggling attendees.admin from the dashboard failed for this reason:
-- the flag change was blocked by its own logging, not by permissions.
--
-- Refusing the write was the wrong trade. A constraint that blocks legitimate
-- database administration gets worked around with `ALTER TABLE ... DISABLE
-- TRIGGER`, which loses the audit entry entirely. Recording the action against
-- a clearly-labelled non-human actor is strictly more honest than not
-- recording it.
--
-- Actor resolution, in order:
--   1. p_actor_id, when a caller passes one explicitly
--   2. current_clerk_id(), the signed-in user -- the normal in-app path
--   3. 'system:' || current_user, e.g. 'system:service_role'
--
-- Case 3 is visibly not a Clerk id (`user_...`), so it cannot be confused with
-- a real person in the log, and it names the database role responsible.
--
-- Anyone reading the audit log should treat a `system:` actor as "changed
-- outside the app" and look for a human explanation elsewhere.

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
    v_clerk_id "text" := COALESCE(p_actor_id, "public"."current_clerk_id"());
    v_actor_id "text";
    v_actor_name "text";
    v_is_system boolean := v_clerk_id IS NULL;
BEGIN
    -- No Clerk identity: attribute to the database role rather than refusing
    -- the write. current_user is the role the statement is running as; under
    -- SECURITY DEFINER that is the function owner, so session_user is checked
    -- first to name the actual connection where they differ.
    v_actor_id := COALESCE(
        v_clerk_id,
        'system:' || COALESCE(NULLIF(session_user::"text", ''), current_user::"text")
    );

    IF p_scope = 'org' AND p_org_id IS NULL THEN
        RAISE EXCEPTION 'org-scoped audit log entries require an org_id' USING ERRCODE = '23514';
    END IF;

    IF NOT v_is_system THEN
        SELECT NULLIF(TRIM(BOTH ' ' FROM COALESCE(a."first_name", '') || ' ' || COALESCE(a."last_name", '')), '')
          INTO v_actor_name
          FROM "public"."attendees" a
         WHERE a."user_id" = v_actor_id
         LIMIT 1;
    END IF;

    INSERT INTO "public"."audit_log"
        ("scope", "org_id", "actor_id", "actor_name", "action", "target_type", "target_id", "metadata")
    VALUES
        (
            p_scope,
            p_org_id,
            v_actor_id,
            -- Reads as "Database (SQL editor)" in the UI rather than a raw role
            -- name, so the log stays legible to a non-technical officer.
            CASE WHEN v_is_system
                 THEN 'Database (' || COALESCE(NULLIF(session_user::"text", ''), current_user::"text") || ')'
                 ELSE COALESCE(v_actor_name, v_actor_id)
            END,
            p_action,
            p_target_type,
            p_target_id,
            -- Flagged in metadata too, so a consumer filtering on the JSON can
            -- separate out-of-app changes without string-matching actor_id.
            COALESCE(p_metadata, '{}'::"jsonb")
                || CASE WHEN v_is_system
                        THEN '{"via":"database"}'::"jsonb"
                        ELSE '{}'::"jsonb"
                   END
        );
END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."_write_audit_log"("text","uuid","text","text","uuid","jsonb","text") FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."_write_audit_log"("text","uuid","text","text","uuid","jsonb","text") TO "service_role";

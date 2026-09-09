-- Auto-join: when an attendees row is claimed (its user_id flips from NULL
-- to a real Clerk id -- the guest-check-in-to-account link performed by the
-- onboarding claim in app/onboarding/actions.ts, or the equivalent claim in
-- checkin/page.tsx), grant a baseline membership in every org this attendee
-- already has attendance history in.
--
-- A DB trigger rather than app code because there are three different call
-- sites that can perform this exact UPDATE (the onboarding server action
-- with the service-role client, and two RLS-gated browser-side claims in
-- page.tsx and checkin/page.tsx) -- a trigger is the one place all three
-- pass through, so the membership backfill can't be missed by hitting the
-- claim from a path that forgot to also call it.
--
-- Only fires when user_id flips NULL -> non-NULL, not on every update of the
-- row. A brand-new attendees row (INSERT with user_id already set, i.e. a
-- signup with no prior guest check-in) can't have prior attendance --
-- attendance.attendee_id can only reference a row that already existed --
-- so there is nothing to backfill on INSERT.
--
-- status is 'pending', not resolved against ORG_MEMBERSHIP_THRESHOLDS: that
-- map lives in lib/membership.ts, not the database, so a trigger has no way
-- to know an org's threshold. resolveAndUpdateMembershipStatus() (called from
-- the check-in flow) upgrades 'pending' to 'active' the next time this person
-- checks in to that org, same as it does for anyone else -- this trigger only
-- guarantees the membership row (and therefore their attendance history)
-- isn't orphaned from the moment they claim it.
--
-- ON CONFLICT DO NOTHING: never overwrites an existing membership -- e.g. an
-- officer role granted (via invite_org_member) before this person ever
-- signed up must not be clobbered back down to 'member'.
CREATE OR REPLACE FUNCTION "public"."claim_backfill_memberships"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
    v_org_id "uuid";
    v_target_name "text" := NULLIF(TRIM(BOTH ' ' FROM COALESCE(NEW."first_name", '') || ' ' || COALESCE(NEW."last_name", '')), '');
BEGIN
    FOR v_org_id IN
        SELECT DISTINCT att."org_id"
        FROM "public"."attendance" att
        WHERE att."attendee_id" = NEW."id"
    LOOP
        INSERT INTO "public"."memberships" ("org_id", "user_id", "role", "status")
        VALUES (v_org_id, NEW."user_id", 'member', 'pending')
        ON CONFLICT ("org_id", "user_id") DO NOTHING;

        -- FOUND reflects whether the INSERT above actually added a row --
        -- false when ON CONFLICT DO NOTHING skipped it. Only log the events
        -- that really happened.
        IF FOUND THEN
            PERFORM "public"."_write_audit_log"(
                'org', v_org_id, 'member.auto_joined', 'membership', NULL,
                jsonb_build_object(
                    'target_user_id', NEW."user_id",
                    'target_name', COALESCE(v_target_name, NEW."user_id")
                ),
                NEW."user_id"
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "attendees_claim_backfill_memberships"
    AFTER UPDATE ON "public"."attendees"
    FOR EACH ROW
    WHEN (OLD."user_id" IS NULL AND NEW."user_id" IS NOT NULL)
    EXECUTE FUNCTION "public"."claim_backfill_memberships"();

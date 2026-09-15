-- Reverts 20260909000000_membership_backfill_on_claim.sql.
--
-- That migration made the claim in app/onboarding/actions.ts (and the
-- equivalent browser-side claims) insert a real memberships row the moment
-- someone's attendees.user_id went from NULL to set, so they'd show up in
-- the admin-dashboard "Total Members" tile and Members roster.
--
-- Superseded by lib/org-members.ts: membership is now computed live from
-- attendees + attendance at display time (see buildOrgMemberRoster), which
-- already handles guests (no Clerk account at all) -- something a
-- memberships row can never represent, since memberships.user_id is a
-- required Clerk id. Leaving this trigger in place would silently create a
-- real memberships row in parallel with that live computation on every
-- claim, double-booking the same event for no purpose.
--
-- claim_backfill_memberships() is a RETURNS TRIGGER function with no other
-- callers, so dropping the trigger and then the function is a clean,
-- complete revert -- nothing else in the schema references either.
DROP TRIGGER IF EXISTS "attendees_claim_backfill_memberships" ON "public"."attendees";
DROP FUNCTION IF EXISTS "public"."claim_backfill_memberships"();

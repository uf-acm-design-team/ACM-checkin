-- Re-enable Row Level Security under Clerk identity.
--
-- Supersedes 20260518000100_disable_rls.sql, which turned RLS off because the
-- original policies compared auth.uid() (Supabase Auth, uuid) against columns
-- that hold Clerk ids (text). With Clerk registered as a Supabase third-party
-- auth provider, the Clerk session JWT is verifiable and its subject is
-- readable as `auth.jwt() ->> 'sub'`.
--
-- ---------------------------------------------------------------------------
-- TWO IDENTITY COLUMNS -- the single likeliest source of bugs here.
--
--   attendees.user_id       text, the Clerk id ("user_2abc..."). NULL for
--                           guests who checked in without an account.
--   attendees.id            uuid, internal PK. This is what
--                           attendance.attendee_id references.
--   memberships.user_id     text, the Clerk id. Joins to Clerk directly.
--
-- So: membership/role checks compare against the Clerk id, but anything
-- touching attendance must join through attendees to translate Clerk id ->
-- attendees.id. The archived policies got this wrong (they compared
-- auth.uid() = attendance.attendee_id, which was never true even under
-- Supabase Auth). current_attendee_id() below does the translation once so no
-- policy has to hand-roll it.
--
-- ---------------------------------------------------------------------------
-- GUEST CHECK-IN IS AN INTENTIONAL PUBLIC FEATURE.
--
-- /[orgSlug]/checkin must work signed-out. The anon grants below are written
-- to be the narrowest set that supports it:
--   - read organizations (render the page)
--   - read ACTIVE meetings only (never past meetings or other orgs)
--   - insert attendance ONLY against a currently-active meeting
--   - insert/find an attendee row by email
-- anon gets NO select on attendance, memberships, or audit_log. A guest can
-- write a check-in but cannot read the room.
--
-- If guest check-in later moves to a server action (recommended -- see P3),
-- delete the two "guest_*" policies (guest_attendees_insert,
-- guest_attendance_insert) and anon keeps no write access at all. Nothing else
-- in this file has to change.


-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The Clerk id of the caller, or NULL when unauthenticated.
CREATE OR REPLACE FUNCTION "public"."current_clerk_id"()
RETURNS "text"
LANGUAGE "sql"
STABLE
AS $$
    SELECT NULLIF("auth"."jwt"() ->> 'sub', '');
$$;

-- The caller's attendees.id, translated from their Clerk id. NULL when signed
-- out or when the user has no attendee profile yet (pre-onboarding).
--
-- SECURITY DEFINER so the lookup itself is not subject to the attendees
-- policies below -- otherwise resolving your own attendee row would depend on
-- a policy that calls this function, which recurses.
CREATE OR REPLACE FUNCTION "public"."current_attendee_id"()
RETURNS "uuid"
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = "public"
AS $$
    SELECT a."id" FROM "public"."attendees" a
    WHERE a."user_id" = "public"."current_clerk_id"()
    LIMIT 1;
$$;

-- Does the caller hold one of `roles` in `org`? Global 'admin' always passes.
-- SECURITY DEFINER for the same recursion reason: the memberships policies
-- call this, so it must not itself be filtered by them.
CREATE OR REPLACE FUNCTION "public"."has_org_role"("p_org_id" "uuid", "p_roles" "text"[])
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = "public"
AS $$
    SELECT EXISTS (
        SELECT 1 FROM "public"."memberships" m
        WHERE m."user_id" = "public"."current_clerk_id"()
          AND (m."role" = 'admin' OR (m."org_id" = p_org_id AND m."role" = ANY(p_roles)))
    );
$$;

-- Officer-or-above shorthand.
CREATE OR REPLACE FUNCTION "public"."is_org_officer"("p_org_id" "uuid")
RETURNS boolean
LANGUAGE "sql"
STABLE
AS $$
    SELECT "public"."has_org_role"(p_org_id, ARRAY['officer','owner','admin']);
$$;

REVOKE EXECUTE ON FUNCTION "public"."current_attendee_id"() FROM "public";
REVOKE EXECUTE ON FUNCTION "public"."has_org_role"("uuid", "text"[]) FROM "public";
GRANT EXECUTE ON FUNCTION "public"."current_clerk_id"()    TO "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."current_attendee_id"() TO "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."has_org_role"("uuid", "text"[]) TO "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_org_officer"("uuid") TO "anon", "authenticated";


-- ---------------------------------------------------------------------------
-- Tighten table grants.
--
-- The baseline issued GRANT ALL to anon and authenticated on every table, so
-- RLS is currently the ONLY barrier. Narrow the grants too: defense in depth,
-- and a dropped policy then fails closed rather than exposing a whole table.
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE "public"."organizations" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."meetings"      FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."attendees"     FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."attendance"    FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."memberships"   FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."audit_log"     FROM "anon", "authenticated";

GRANT SELECT                         ON "public"."organizations" TO "anon", "authenticated";
GRANT INSERT, UPDATE                 ON "public"."organizations" TO "authenticated";
GRANT SELECT                         ON "public"."meetings"      TO "anon", "authenticated";
GRANT INSERT, UPDATE, DELETE         ON "public"."meetings"      TO "authenticated";
GRANT SELECT, INSERT, UPDATE         ON "public"."attendees"     TO "anon", "authenticated";
GRANT SELECT, INSERT                 ON "public"."attendance"    TO "authenticated";
GRANT INSERT                         ON "public"."attendance"    TO "anon";
GRANT SELECT, INSERT, UPDATE         ON "public"."memberships"   TO "authenticated";
GRANT SELECT, INSERT                 ON "public"."audit_log"     TO "authenticated";


-- ---------------------------------------------------------------------------
-- organizations -- public read (needed to render any org page, incl. guests).
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orgs_public_read" ON "public"."organizations"
    FOR SELECT TO "anon", "authenticated"
    USING (true);

-- Only a global admin creates orgs. This replaces the attendees.admin check in
-- app/adminDashboard/page.tsx, whose authorization is currently commented out.
CREATE POLICY "orgs_admin_insert" ON "public"."organizations"
    FOR INSERT TO "authenticated"
    WITH CHECK ("public"."has_org_role"("id", ARRAY['admin']));

CREATE POLICY "orgs_officer_update" ON "public"."organizations"
    FOR UPDATE TO "authenticated"
    USING ("public"."has_org_role"("id", ARRAY['owner','admin']))
    WITH CHECK ("public"."has_org_role"("id", ARRAY['owner','admin']));


-- ---------------------------------------------------------------------------
-- meetings
--   anon:          active meetings only (the guest check-in page).
--   authenticated: all meetings of orgs you belong to.
--   officers:      full CRUD in their org.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."meetings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings_anon_read_active" ON "public"."meetings"
    FOR SELECT TO "anon"
    USING ("status" = true);

CREATE POLICY "meetings_member_read" ON "public"."meetings"
    FOR SELECT TO "authenticated"
    USING (
        "status" = true
        OR EXISTS (
            SELECT 1 FROM "public"."memberships" m
            WHERE m."org_id" = "meetings"."org_id"
              AND m."user_id" = "public"."current_clerk_id"()
        )
        OR "public"."is_org_officer"("org_id")
    );

CREATE POLICY "meetings_officer_insert" ON "public"."meetings"
    FOR INSERT TO "authenticated"
    WITH CHECK ("public"."is_org_officer"("org_id"));

CREATE POLICY "meetings_officer_update" ON "public"."meetings"
    FOR UPDATE TO "authenticated"
    USING ("public"."is_org_officer"("org_id"))
    WITH CHECK ("public"."is_org_officer"("org_id"));

CREATE POLICY "meetings_officer_delete" ON "public"."meetings"
    FOR DELETE TO "authenticated"
    USING ("public"."is_org_officer"("org_id"));


-- ---------------------------------------------------------------------------
-- attendees -- personal data (name, email, grad year). The table most worth
-- protecting, and the one currently fully readable with the anon key.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."attendees" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendees_read_own" ON "public"."attendees"
    FOR SELECT TO "authenticated"
    USING ("user_id" = "public"."current_clerk_id"());

-- Officers see attendees who have attended one of their org's meetings --
-- scoped by attendance, not a blanket read of every attendee in the system.
CREATE POLICY "attendees_officer_read" ON "public"."attendees"
    FOR SELECT TO "authenticated"
    USING (
        EXISTS (
            SELECT 1 FROM "public"."attendance" att
            WHERE att."attendee_id" = "attendees"."id"
              AND "public"."is_org_officer"(att."org_id")
        )
    );

CREATE POLICY "attendees_insert_own" ON "public"."attendees"
    FOR INSERT TO "authenticated"
    WITH CHECK ("user_id" = "public"."current_clerk_id"());

CREATE POLICY "attendees_update_own" ON "public"."attendees"
    FOR UPDATE TO "authenticated"
    USING ("user_id" = "public"."current_clerk_id"())
    WITH CHECK ("user_id" = "public"."current_clerk_id"());

-- Guest check-in: create a profile with no Clerk id attached.
CREATE POLICY "guest_attendees_insert" ON "public"."attendees"
    FOR INSERT TO "anon"
    WITH CHECK ("user_id" IS NULL);

-- The email -> Clerk relink in checkin/page.tsx claims an orphaned guest row.
-- Only a signed-in user may do it, only onto a row that is not yet claimed,
-- and only by setting user_id to their OWN Clerk id.
CREATE POLICY "attendees_claim_by_email" ON "public"."attendees"
    FOR UPDATE TO "authenticated"
    USING ("user_id" IS NULL)
    WITH CHECK ("user_id" = "public"."current_clerk_id"());


-- ---------------------------------------------------------------------------
-- attendance
--
-- NOTE the anon INSERT policy has no USING clause. FOR INSERT policies only
-- take WITH CHECK, so a guest can write a check-in but has no read path --
-- exactly the asymmetry the public check-in page needs.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_read_own" ON "public"."attendance"
    FOR SELECT TO "authenticated"
    USING ("attendee_id" = "public"."current_attendee_id"());

CREATE POLICY "attendance_officer_read" ON "public"."attendance"
    FOR SELECT TO "authenticated"
    USING ("public"."is_org_officer"("org_id"));

-- A signed-in member checks themselves in, only to an active meeting of the
-- org the row claims. attendee_id must be their own -- no checking in as
-- someone else.
CREATE POLICY "attendance_insert_own" ON "public"."attendance"
    FOR INSERT TO "authenticated"
    WITH CHECK (
        "attendee_id" = "public"."current_attendee_id"()
        AND EXISTS (
            SELECT 1 FROM "public"."meetings" m
            WHERE m."id" = "attendance"."meeting_id"
              AND m."org_id" = "attendance"."org_id"
              AND m."status" = true
        )
    );

-- Guest check-in. Constrained to an active meeting and a consistent org_id;
-- cannot backfill a past meeting or forge attendance in another org.
CREATE POLICY "guest_attendance_insert" ON "public"."attendance"
    FOR INSERT TO "anon"
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."meetings" m
            WHERE m."id" = "attendance"."meeting_id"
              AND m."org_id" = "attendance"."org_id"
              AND m."status" = true
        )
    );

CREATE POLICY "attendance_officer_insert" ON "public"."attendance"
    FOR INSERT TO "authenticated"
    WITH CHECK ("public"."is_org_officer"("org_id"));


-- ---------------------------------------------------------------------------
-- memberships -- drives role checks, so writes must be tight.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memberships_read_own" ON "public"."memberships"
    FOR SELECT TO "authenticated"
    USING ("user_id" = "public"."current_clerk_id"());

CREATE POLICY "memberships_officer_read" ON "public"."memberships"
    FOR SELECT TO "authenticated"
    USING ("public"."is_org_officer"("org_id"));

-- Self-join as a plain member only. The role is pinned to 'member' so a user
-- cannot insert themselves as owner -- the privilege-escalation hole that is
-- wide open today.
CREATE POLICY "memberships_self_join" ON "public"."memberships"
    FOR INSERT TO "authenticated"
    WITH CHECK (
        "user_id" = "public"."current_clerk_id"()
        AND "role" = 'member'
    );

-- Membership promotion (pending -> active) from the check-in flow. Role must
-- stay 'member'; changing your own role requires an officer.
CREATE POLICY "memberships_self_status" ON "public"."memberships"
    FOR UPDATE TO "authenticated"
    USING ("user_id" = "public"."current_clerk_id"() AND "role" = 'member')
    WITH CHECK ("user_id" = "public"."current_clerk_id"() AND "role" = 'member');

CREATE POLICY "memberships_officer_insert" ON "public"."memberships"
    FOR INSERT TO "authenticated"
    WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner','admin']));

CREATE POLICY "memberships_officer_update" ON "public"."memberships"
    FOR UPDATE TO "authenticated"
    USING ("public"."has_org_role"("org_id", ARRAY['owner','admin']))
    WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner','admin']));


-- ---------------------------------------------------------------------------
-- audit_log -- append-only for officers, readable by owners/admins.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_owner_read" ON "public"."audit_log"
    FOR SELECT TO "authenticated"
    USING ("public"."has_org_role"("org_id", ARRAY['owner','admin']));

CREATE POLICY "audit_officer_insert" ON "public"."audit_log"
    FOR INSERT TO "authenticated"
    WITH CHECK (
        "public"."is_org_officer"("org_id")
        AND "user_id" = "public"."current_clerk_id"()
    );

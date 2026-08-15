-- Integrity constraints the app currently enforces only in JavaScript.
--
-- Each of these guards a read-then-write race: the client SELECTs to check for
-- an existing row, then INSERTs. Two concurrent requests both observe "no row"
-- and both insert. The DB is the only place that can win that race.
--
-- Every constraint below deduplicates existing rows first, so this migration is
-- safe to apply to a database that has already accumulated duplicates. The
-- dedupe keeps the OLDEST row in each group (earliest created/checked-in), so
-- the surviving row is the one users actually saw first.


-- 1. One check-in per attendee per meeting.
--
-- app/[orgSlug]/checkin/page.tsx performCheckIn() selects from attendance and
-- bails with "You've already checked in" before inserting. Double-tapping the
-- button, or two devices at once, can slip two rows past that check.
--
-- Note get_member_meetings_page already defends against this downstream ("uses
-- `exists` (not a join/count) keeps a duplicate attendance row from
-- double-affecting the flag") -- but membership promotion in
-- resolveAndUpdateMembershipStatus counts rows directly, so duplicates inflate
-- attendance and promote members early.
DELETE FROM "public"."attendance" a
      USING "public"."attendance" b
      WHERE a."meeting_id"  = b."meeting_id"
        AND a."attendee_id" = b."attendee_id"
        AND (a."checked_in_at", a."id") > (b."checked_in_at", b."id");

ALTER TABLE "public"."attendance"
    ADD CONSTRAINT "attendance_meeting_attendee_key"
    UNIQUE ("meeting_id", "attendee_id");


-- 2. One attendee row per Clerk user.
--
-- The check-in page links an orphaned attendee to a Clerk user by email
-- (attendees.update({user_id}) where email matches). Nothing stops two rows
-- from ending up with the same user_id, which would make the
-- .maybeSingle() lookups in dashboard/stats throw on multiple rows returned.
--
-- Partial index: user_id is NULL for guest-created attendees, and NULLs must
-- stay unconstrained (many guests, no Clerk account).
DELETE FROM "public"."attendees" a
      USING "public"."attendees" b
      WHERE a."user_id" IS NOT NULL
        AND a."user_id" = b."user_id"
        AND (a."created_at", a."id") > (b."created_at", b."id");

CREATE UNIQUE INDEX "attendees_user_id_key"
    ON "public"."attendees" ("user_id")
    WHERE "user_id" IS NOT NULL;


-- 3. One attendee row per email address, case-insensitively.
--
-- Guest check-in creates an attendee from a typed email with no uniqueness
-- check at all, so "Bob@ufl.edu" and "bob@ufl.edu" become separate people with
-- separate attendance histories. Lowercased to match how the email-relink
-- lookup should behave.
--
-- Dedupe prefers a row that is already linked to a Clerk user (user_id NOT
-- NULL sorts first) over an unlinked guest row, then falls back to oldest --
-- otherwise this could delete the row a signed-in member depends on.
DELETE FROM "public"."attendees" a
      USING "public"."attendees" b
      WHERE lower(a."email") = lower(b."email")
        AND (a."user_id" IS NULL, a."created_at", a."id")
          > (b."user_id" IS NULL, b."created_at", b."id");

CREATE UNIQUE INDEX "attendees_email_lower_key"
    ON "public"."attendees" (lower("email"));


-- 4. Supporting index for the hottest attendance query.
--
-- Both resolveAndUpdateMembershipStatus and the org/dashboard attendance
-- counts filter on (attendee_id, org_id). The unique constraint above indexes
-- (meeting_id, attendee_id), which does not serve this access pattern.
CREATE INDEX IF NOT EXISTS "attendance_attendee_org_idx"
    ON "public"."attendance" ("attendee_id", "org_id");

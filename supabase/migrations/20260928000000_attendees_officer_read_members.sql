-- Officers could only read attendees who had checked in to one of their org's
-- meetings (attendees_officer_read, keyed on attendance). A person holding a
-- memberships row in the org with zero check-ins there -- an invited member,
-- an officer or co-owner appointed before attending anything -- was therefore
-- unreadable to everyone but global admins, and lib/org-members.ts rendered
-- them as the "Unknown" orphan placeholder in the Members tab.
--
-- Same shape as attendees_officer_read, keyed on memberships instead. Scope is
-- unchanged in spirit: an officer sees people connected to their org, never a
-- blanket read of every attendee in the system.
DROP POLICY IF EXISTS "attendees_officer_read_members" ON "public"."attendees";
CREATE POLICY "attendees_officer_read_members" ON "public"."attendees"
    FOR SELECT TO "authenticated"
    USING (
        "user_id" IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM "public"."memberships" m
            WHERE m."user_id" = "attendees"."user_id"
              AND "public"."is_org_officer"(m."org_id")
        )
    );

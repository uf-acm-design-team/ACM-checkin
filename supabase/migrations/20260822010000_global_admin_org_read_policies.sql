-- Allow platform admins to read org-scoped data even when they are not members
-- of the specific org. This keeps the developer/admin model consistent with the
-- updated global-admin logic in 20260822000000_global_admin_no_org_bypass.sql.

DROP POLICY IF EXISTS "organizations_admin_read" ON "public"."organizations";
CREATE POLICY "organizations_admin_read" ON "public"."organizations"
    FOR SELECT TO "authenticated"
    USING ("public"."is_global_admin"());

DROP POLICY IF EXISTS "meetings_admin_read" ON "public"."meetings";
CREATE POLICY "meetings_admin_read" ON "public"."meetings"
    FOR SELECT TO "authenticated"
    USING ("public"."is_global_admin"());

DROP POLICY IF EXISTS "attendees_admin_read" ON "public"."attendees";
CREATE POLICY "attendees_admin_read" ON "public"."attendees"
    FOR SELECT TO "authenticated"
    USING ("public"."is_global_admin"());

DROP POLICY IF EXISTS "attendance_admin_read" ON "public"."attendance";
CREATE POLICY "attendance_admin_read" ON "public"."attendance"
    FOR SELECT TO "authenticated"
    USING ("public"."is_global_admin"());

DROP POLICY IF EXISTS "memberships_admin_read" ON "public"."memberships";
CREATE POLICY "memberships_admin_read" ON "public"."memberships"
    FOR SELECT TO "authenticated"
    USING ("public"."is_global_admin"());

DROP POLICY IF EXISTS "audit_admin_read" ON "public"."audit_log";
CREATE POLICY "audit_admin_read" ON "public"."audit_log"
    FOR SELECT TO "authenticated"
    USING ("public"."is_global_admin"());

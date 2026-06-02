-- Clerk user IDs are strings like "user_2abc..." not UUIDs.
-- Change memberships.user_id from uuid to text so queries filtering by
-- the Clerk-issued ID work without a type-cast error.
--
-- The existing RLS policies reference memberships.user_id (and compare it to
-- auth.uid(), which is uuid). Under Clerk those policies are non-functional
-- (auth.uid() is null), and RLS is already disabled in
-- 20260518000100_disable_rls.sql -- so we drop the policies here. They can be
-- re-introduced later under a Clerk-aware auth scheme.

DROP POLICY IF EXISTS "Admin can see organizations" ON "public"."organizations";
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON "public"."audit_log";
DROP POLICY IF EXISTS "Members can view attendance history" ON "public"."attendance";
DROP POLICY IF EXISTS "Officers can create meetings" ON "public"."meetings";
DROP POLICY IF EXISTS "Officers can delete meetings" ON "public"."meetings";
DROP POLICY IF EXISTS "Officers can update meetings" ON "public"."meetings";
DROP POLICY IF EXISTS "Officers can view attendance data (and admins)" ON "public"."attendance";
DROP POLICY IF EXISTS "Owners and Admins can see audit log" ON "public"."audit_log";
DROP POLICY IF EXISTS "Users can view their own data + Officers can view org member li" ON "public"."memberships";
DROP POLICY IF EXISTS "View Active Meetings, Officers can view ALL meetings" ON "public"."meetings";

ALTER TABLE "public"."memberships"
    ALTER COLUMN "user_id" TYPE "text" USING "user_id"::"text";

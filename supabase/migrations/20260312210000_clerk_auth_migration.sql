-- Migration: Switch from Supabase Auth to Clerk Auth
-- Clerk user IDs are strings (e.g., "user_2abc..."), not UUIDs.
-- We need to drop FK constraints to auth.users and change column types.

-- 1. Drop FK constraints referencing auth.users
ALTER TABLE "public"."attendee" DROP CONSTRAINT IF EXISTS "profiles_user_id_fkey";
ALTER TABLE "public"."organizations" DROP CONSTRAINT IF EXISTS "organizations_created_by_fkey";
ALTER TABLE "public"."meetings" DROP CONSTRAINT IF EXISTS "meetings_created_by_fkey";
ALTER TABLE "public"."audit_log" DROP CONSTRAINT IF EXISTS "audit_log_user_id_fkey";
ALTER TABLE "public"."memberships" DROP CONSTRAINT IF EXISTS "memerships_user_id_fkey";

-- 2. Change column types from uuid to text (Clerk IDs are strings)
ALTER TABLE "public"."attendee" ALTER COLUMN "user_id" TYPE "text" USING "user_id"::text;
ALTER TABLE "public"."organizations" ALTER COLUMN "created_by" TYPE "text" USING "created_by"::text;
ALTER TABLE "public"."meetings" ALTER COLUMN "created_by" TYPE "text" USING "created_by"::text;
ALTER TABLE "public"."audit_log" ALTER COLUMN "user_id" TYPE "text" USING "user_id"::text;
ALTER TABLE "public"."memberships" ALTER COLUMN "user_id" TYPE "text" USING "user_id"::text;

-- 3. Drop the Memberships primary key (contains user_id which changed type)
--    and recreate it
ALTER TABLE "public"."memberships" DROP CONSTRAINT IF EXISTS "Memberships_pkey";
ALTER TABLE "public"."memberships" ADD CONSTRAINT "Memberships_pkey" PRIMARY KEY ("org_id", "user_id");

-- 4. Update default values that used auth.uid()
ALTER TABLE "public"."attendance" ALTER COLUMN "attendee_id" DROP DEFAULT;
ALTER TABLE "public"."organizations" ALTER COLUMN "created_by" DROP DEFAULT;
ALTER TABLE "public"."meetings" ALTER COLUMN "created_by" DROP DEFAULT;
ALTER TABLE "public"."audit_log" ALTER COLUMN "user_id" DROP DEFAULT;

-- 5. Drop RLS policies that reference auth.uid() (will need to be recreated
--    if using Clerk's Supabase JWT integration)
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

-- 6. Disable RLS on tables (can be re-enabled later with Clerk JWT integration)
ALTER TABLE "public"."attendance" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."attendee" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_log" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."meetings" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."memberships" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organizations" DISABLE ROW LEVEL SECURITY;

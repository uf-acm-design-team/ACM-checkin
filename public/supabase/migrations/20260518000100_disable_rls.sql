-- Disable RLS on all public tables.
-- Clerk handles auth at the app layer; auth.uid() (the basis of the existing
-- policies) is empty under Clerk, so RLS would block all access.

ALTER TABLE "public"."attendance"    DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."attendees"     DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_log"     DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."meetings"      DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."memberships"   DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organizations" DISABLE ROW LEVEL SECURITY;

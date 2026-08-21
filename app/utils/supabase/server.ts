import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client that forwards the Clerk session token so Postgres
// sees the Clerk identity (authenticated role). RLS is disabled today; this is
// the RLS-ready seam. Named createClerkSupabaseClient to avoid colliding with
// the @supabase/ssr createServerClient used on the aed branch.
//
// One-time setup (see design spec): enable the Supabase integration in the Clerk
// dashboard, then register Clerk as a Third-Party Auth provider in Supabase.
// Until then getToken() returns null and this behaves like the anon client
// (works because RLS is off).
export function createClerkSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { accessToken: async () => (await auth()).getToken() },
  );
}

// Anon client (no Clerk token, no request-header reads) for org-wide,
// non-user-specific reads. Safe to call inside unstable_cache — unlike the
// Clerk client, it never invokes auth()/headers(), which Next forbids in a
// cached scope. Only fit for tables/rows that anon's RLS policies actually
// expose (e.g. organizations, active meetings) — see createServiceSupabaseClient
// below for the rest.
export function createAnonSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// Service-role client, server-only. Bypasses RLS entirely, so every query
// made with it must already be scoped correctly in application code (filtered
// by a userId/orgId/attendeeId resolved from auth(), never taken unchecked
// from the caller). Like the anon client above, it never calls auth()/reads
// headers, so it's also safe inside unstable_cache.
//
// Needed for lib/stats-data.ts: 20260813000100_enable_rls_clerk.sql tightened
// grants so anon has no SELECT on memberships/attendance at all, and can only
// see meetings with status = true -- which excludes every meeting the
// auto-close cron has since closed. That file deliberately reads with this
// client and re-derives/checks identity itself (see its own top-of-file note)
// rather than relying on RLS, which is why that's safe here.
export function createServiceSupabaseClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

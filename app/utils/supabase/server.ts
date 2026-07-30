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
// cached scope. Org meeting totals are non-sensitive and RLS is off.
export function createAnonSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

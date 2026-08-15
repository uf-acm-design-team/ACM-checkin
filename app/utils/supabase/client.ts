import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Browser Supabase client.
//
// The `accessToken` callback forwards the current Clerk session JWT on every
// request, which is what makes RLS work from the client: the policies in
// 20260813000100_enable_rls_clerk.sql read the caller's identity from
// `auth.jwt() ->> 'sub'`. Without this the browser talks to Supabase as `anon`
// and every user-scoped policy denies -- which surfaces as silently empty
// lists (no error), not as an auth failure.
//
// Clerk is loaded by ClerkProvider in app/layout.tsx and puts its instance on
// window.Clerk. Returning null when it isn't ready yet (or when signed out) is
// correct: the request then runs as `anon`, which is exactly what the public
// guest check-in page needs.
type ClerkWindow = Window & {
  Clerk?: { session?: { getToken: () => Promise<string | null> } };
};

const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    accessToken: async () => {
      if (typeof window === "undefined") return null;
      return (await (window as ClerkWindow).Clerk?.session?.getToken()) ?? null;
    },
  },
);

export function createClient() {
  return supabase;
}

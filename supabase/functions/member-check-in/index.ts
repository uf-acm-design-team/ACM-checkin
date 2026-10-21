import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Member check-in for the mobile app (and eventually web), replacing the
// memberCheckIn server action in app/[orgSlug]/checkin/actions.ts.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ ok: false, error: "Server configuration is missing." }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ ok: false, error: "Missing auth token." }, 401);
  }

  try {
    // Resolve the caller's Clerk id the same way RLS does (auth.jwt() ->>
    // 'sub'), by calling the existing current_clerk_id() RPC as the caller --
    // rather than hand-rolling JWT verification here.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: clerkId, error: clerkIdError } = await callerClient.rpc(
      "current_clerk_id",
    );

    // Prevent users who are not authenticated from accessing the endpoint.
    // In the future, determine how to handle potential server errors where clerkId is not set due
    // to Supabase or Clerk outages.
    if (clerkIdError || !clerkId) {
      return jsonResponse(
        { ok: false, error: "You need to be signed in." },
        401,
      );
    }

    return jsonResponse({ ok: false, error: "not implemented" }, 501);
  } catch (error) {
    console.error("member-check-in error:", error);
    return jsonResponse(
      { ok: false, error: "An unexpected error occurred during check-in." },
      500,
    );
  }
});

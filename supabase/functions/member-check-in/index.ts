import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { performCheckIn } from "./check-in.ts";
import type { MemberCheckInErrorCode, MemberCheckInResponse } from "./contract.ts";
import { parseCheckInRequest } from "./validate.ts";

// Member check-in for the mobile app (and eventually web), replacing the
// memberCheckIn server action in app/[orgSlug]/checkin/actions.ts.
// The request/response contract lives in contract.ts.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STATUS_BY_CODE: Record<MemberCheckInErrorCode, number> = {
  invalid_request: 400,
  unauthenticated: 401,
  no_profile: 403,
  wrong_password: 403,
  outside_geofence: 403,
  org_not_found: 404,
  method_not_allowed: 405,
  no_active_meeting: 409,
  meeting_closed: 409,
  invalid_answers: 422,
  server_error: 500,
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Every response goes through here, so each one is checked against the contract. */
function respond(body: MemberCheckInResponse) {
  return jsonResponse(body, body.ok ? 200 : STATUS_BY_CODE[body.code]);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond({ ok: false, code: "method_not_allowed", error: "Method not allowed." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !anonKey) {
    return respond({ ok: false, code: "server_error", error: "Server configuration is missing." });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return respond({ ok: false, code: "unauthenticated", error: "Missing auth token." });
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
      return respond({ ok: false, code: "unauthenticated", error: "You need to be signed in." });
    }

    // Validated after auth, so an anonymous caller learns nothing about the
    // request shape.
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return respond({
        ok: false,
        code: "invalid_request",
        error: "Request body must be valid JSON.",
        fieldErrors: { body: "Could not parse as JSON." },
      });
    }

    const parsed = parseCheckInRequest(body);
    if (!parsed.ok) {
      return respond({
        ok: false,
        code: "invalid_request",
        error: "Invalid check-in request. See fieldErrors.",
        fieldErrors: parsed.fieldErrors,
      });
    }

    return respond(await performCheckIn(callerClient, clerkId, parsed.request));
  } catch (error) {
    console.error("member-check-in error:", error);
    return respond({
      ok: false,
      code: "server_error",
      error: "An unexpected error occurred during check-in.",
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClerkClient } from "npm:@clerk/backend";
import { escapeLikePattern, sameEmail } from "../_shared/email-match.ts";

// Onboards an attendee from the mobile app and eventually web:
// 1. Verifies caller identity via the Clerk JWT (using current_clerk_id() RPC).
// 2. Retrieves the user's primary email directly from Clerk using clerkClient.
// 3. Already onboarded (attendees row exists for this user_id) -> no-op.
// 4. Orphaned guest row exists (user_id IS NULL and email matches) -> claims it.
// 5. Otherwise -> inserts a fresh attendees row.
// 6. Syncs user name and publicMetadata.onboardingComplete to Clerk.
//
// Never trusts user_id or email from the request body. All DB mutations run as
// service_role, scoped strictly to the verified Clerk ID.

const MAX_NAME_LENGTH = 100;

function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

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

// Claims the orphaned guest row (user_id IS NULL) whose email is exactly
// `email`, case-insensitively. ilike takes a pattern, so candidates are found
// with an escaped one and confirmed with sameEmail() before the single matching
// row is updated by id -- updating straight through the ilike let
// "john_doe@" take over johnxdoe's row and attendance history.
async function claimGuestRow(
  supabaseAdmin: ReturnType<typeof createClient>,
  clerkId: string,
  email: string,
  profile: { first_name: string; last_name: string; grad_year: unknown },
) {
  const { data: candidates, error: findError } = await supabaseAdmin
    .from("attendees")
    .select("id, email")
    .is("user_id", null)
    .ilike("email", escapeLikePattern(email));
  if (findError) return { data: null, error: findError };

  const match = (candidates as { id: string; email: string | null }[] | null)?.find((a) =>
    sameEmail(a.email, email)
  );
  if (!match) return { data: [], error: null };

  // user_id IS NULL again so a concurrent claim can't be overwritten.
  return await supabaseAdmin
    .from("attendees")
    .update({ user_id: clerkId, ...profile })
    .eq("id", match.id)
    .is("user_id", null)
    .select("id, email, first_name, last_name, grad_year");
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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clerkSecretKey = Deno.env.get("CLERK_SECRET_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: "Server configuration is missing." }, 500);
  }

  if (!clerkSecretKey) {
    console.error("CLERK_SECRET_KEY is not configured.");
    return jsonResponse({ ok: false, error: "Clerk server configuration is missing." }, 500);
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

    if (clerkIdError || !clerkId) {
      console.error("Auth verification failed:", {
        error: clerkIdError?.message ?? clerkIdError,
        clerkId,
        authHeaderPrefix: authHeader ? authHeader.slice(0, 25) + "..." : null,
      });
      return jsonResponse(
        { ok: false, error: "You must be signed in to complete onboarding." },
        401,
      );
    }

    // Retrieve user and verified primary email directly from Clerk via clerkClient
    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    let email = "";
    try {
      const clerkUser = await clerk.users.getUser(clerkId);
      const emailObj =
        clerkUser.emailAddresses.find(
          (e) => e.id === clerkUser.primaryEmailAddressId,
        ) ?? clerkUser.emailAddresses[0];

      email = (emailObj?.emailAddress ?? "").trim().toLowerCase();
    } catch (clerkErr) {
      console.error("Failed to fetch Clerk user details:", clerkErr);
      return jsonResponse(
        { ok: false, error: "Could not retrieve user details from Clerk." },
        401,
      );
    }

    if (!email) {
      return jsonResponse(
        { ok: false, error: "No email address found for this Clerk account." },
        400,
      );
    }

    // Parse input fields. Support both application/json and multipart/form-data because we still haven't decided
    // on the mobile implementation. We could converge on one implementation in the future.
    let firstName = "";
    let lastName = "";
    let gradYear = "";

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      let body: Record<string, unknown> = {};
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ ok: false, error: "Invalid JSON body." }, 400);
      }
      firstName = sanitizeName(String(body.firstName ?? ""));
      lastName = sanitizeName(String(body.lastName ?? ""));
      gradYear = String(body.gradYear ?? "").trim();
    } else {
      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        return jsonResponse(
          { ok: false, error: "Expected JSON or multipart/form-data." },
          400,
        );
      }
      firstName = sanitizeName(String(form.get("firstName") ?? ""));
      lastName = sanitizeName(String(form.get("lastName") ?? ""));
      gradYear = String(form.get("gradYear") ?? "").trim();
    }

    if (!firstName || !lastName || !gradYear) {
      return jsonResponse(
        { ok: false, error: "Missing required fields." },
        400,
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Already onboarded check: row already exists for this Clerk user ID
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("attendees")
      .select("id, email, first_name, last_name, grad_year")
      .eq("user_id", clerkId)
      .maybeSingle();

    if (existingError) {
      console.error("Attendee lookup error:", existingError);
      return jsonResponse({ ok: false, error: "Could not check attendee profile status." }, 500);
    }

    if (existing) {
      return jsonResponse(
        { ok: true, success: true, alreadyOnboarded: true, attendee: existing },
        200,
      );
    }

    // 2. Claim orphaned guest row with matching lower(email) and user_id IS NULL
    const { data: claimedRows, error: claimError } = await claimGuestRow(
      supabaseAdmin,
      clerkId,
      email,
      { first_name: firstName, last_name: lastName, grad_year: gradYear },
    );

    if (claimError) {
      console.error("Claim guest attendee error:", claimError);
      return jsonResponse(
        { ok: false, error: "Failed to link your existing check-ins: " + claimError.message },
        500,
      );
    }

    let attendeeData = null;
    let claimed = false;

    if (claimedRows && claimedRows.length > 0) {
      claimed = true;
      attendeeData = claimedRows[0];
    } else {
      // 3. Otherwise insert fresh attendee row
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("attendees")
        .insert({
          user_id: clerkId,
          email: email,
          first_name: firstName,
          last_name: lastName,
          grad_year: gradYear,
        })
        .select("id, email, first_name, last_name, grad_year")
        .single();

      if (insertError) {
        // 23505 on attendees_email_lower_key means a row with this email exists
        // that the claim above didn't catch (e.g. concurrent guest check-in race).
        // Retry claim once rather than failing with a conflict.
        const isEmailConflict =
          insertError.code === "23505" &&
          (insertError.message?.includes("attendees_email_lower_key") ||
            insertError.details?.includes("email"));

        if (isEmailConflict) {
          const { data: retryClaimed, error: retryError } = await claimGuestRow(
            supabaseAdmin,
            clerkId,
            email,
            { first_name: firstName, last_name: lastName, grad_year: gradYear },
          );

          if (retryClaimed && retryClaimed.length > 0) {
            claimed = true;
            attendeeData = retryClaimed[0];
          } else {
            if (retryError) {
              console.error("Retry claim failed:", retryError);
            }
            return jsonResponse(
              {
                ok: false,
                error:
                  "This email is already linked to another account. Contact an officer if that's unexpected.",
              },
              409,
            );
          }
        } else {
          console.error("Attendee insert error:", insertError);
          return jsonResponse(
            { ok: false, error: "Failed to save profile: " + insertError.message },
            500,
          );
        }
      } else {
        attendeeData = inserted;
      }
    }

    // Sync profile and onboarding metadata to Clerk
    try {
      await clerk.users.updateUser(clerkId, {
        firstName,
        lastName,
        publicMetadata: { onboardingComplete: true },
      });
    } catch (syncErr) {
      console.warn("Non-fatal: Failed to update Clerk user metadata:", syncErr);
    }

    return jsonResponse(
      { ok: true, success: true, claimed, attendee: attendeeData },
      200,
    );
  } catch (error) {
    console.error("onboard-attendee error:", error);
    return jsonResponse(
      { ok: false, error: "An unexpected error occurred during onboarding." },
      500,
    );
  }
});

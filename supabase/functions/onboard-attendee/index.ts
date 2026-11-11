import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClerkClient } from "npm:@clerk/backend";
import { escapeLikePattern, sameEmail } from "../_shared/email-match.ts";
import { corsPreflight, responder } from "../_shared/http.ts";
import type {
  OnboardAttendeeErrorCode,
  OnboardAttendeeResponse,
  OnboardedAttendee,
} from "./contract.ts";
import { parseOnboardingFields, type Profile } from "./validate.ts";

// Onboards an attendee, for mobile and web. Request and response types are in
// contract.ts.
//
// 1. Verifies caller identity via the Clerk JWT (using current_clerk_id() RPC).
// 2. Already onboarded (attendees row exists for this user_id) -> no-op.
// 3. Orphaned guest row exists (user_id IS NULL and email matches) -> claims it.
//    The email comes from Clerk's own record, never the request.
// 4. Otherwise, with a profile -> inserts a fresh attendees row.
//    Otherwise, link-only (no profile sent) -> answers needsProfile.
// 5. Sets publicMetadata.onboardingComplete in Clerk (and the name, when a
//    profile was sent).
//
// Never trusts user_id or email from the request body. All DB mutations run as
// service_role, scoped strictly to the verified Clerk ID.

const ATTENDEE_COLUMNS = "id, email, first_name, last_name, grad_year";

const STATUS_BY_CODE: Record<OnboardAttendeeErrorCode, number> = {
  invalid_request: 400,
  no_email: 400,
  unauthenticated: 401,
  method_not_allowed: 405,
  email_taken: 409,
  server_error: 500,
};

/** Every response goes through here, so each one is checked against the contract. */
const respond = responder<OnboardAttendeeResponse>(STATUS_BY_CODE);

function linked(
  attendee: OnboardedAttendee,
  { alreadyOnboarded, claimed }: { alreadyOnboarded: boolean; claimed: boolean },
) {
  return respond({
    ok: true,
    success: true,
    needsProfile: false,
    alreadyOnboarded,
    claimed,
    attendee,
  });
}

/** Reads the body into a plain object, or returns null when it can't be parsed. */
async function readFields(req: Request): Promise<Record<string, unknown> | null> {
  const contentType = req.headers.get("content-type") ?? "";
  // Support both JSON and multipart/form-data because we still haven't decided
  // on the mobile implementation. We could converge on one in the future.
  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    try {
      return Object.fromEntries((await req.formData()).entries());
    } catch {
      return null;
    }
  }
  // Anything else is read as JSON. An empty body (link-only, sent with no
  // content type) is the same as {}.
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    const body = JSON.parse(text);
    return typeof body === "object" && body !== null && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

// Claims the orphaned guest row (user_id IS NULL) whose email is exactly
// `email`, case-insensitively. ilike takes a pattern, so candidates are found
// with an escaped one and confirmed with sameEmail() before the single matching
// row is updated by id -- updating straight through the ilike let
// "john_doe@" take over johnxdoe's row and attendance history.
//
// With a profile, the form's values replace the guest row's. Without one
// (link-only), the row keeps what the guest typed at check-in.
async function claimGuestRow(
  supabaseAdmin: SupabaseClient,
  clerkId: string,
  email: string,
  profile: Profile | null,
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

  const profileColumns = profile
    ? { first_name: profile.firstName, last_name: profile.lastName, grad_year: profile.gradYear }
    : {};

  // user_id IS NULL again so a concurrent claim can't be overwritten.
  return await supabaseAdmin
    .from("attendees")
    .update({ user_id: clerkId, ...profileColumns })
    .eq("id", match.id)
    .is("user_id", null)
    .select(ATTENDEE_COLUMNS);
}

serve(async (req) => {
  const preflight = corsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return respond({ ok: false, code: "method_not_allowed", error: "Method not allowed." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clerkSecretKey = Deno.env.get("CLERK_SECRET_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond({ ok: false, code: "server_error", error: "Server configuration is missing." });
  }

  if (!clerkSecretKey) {
    console.error("CLERK_SECRET_KEY is not configured.");
    return respond({
      ok: false,
      code: "server_error",
      error: "Clerk server configuration is missing.",
    });
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

    if (clerkIdError || !clerkId) {
      console.error("Auth verification failed:", {
        error: clerkIdError?.message ?? clerkIdError,
        clerkId,
        authHeaderPrefix: authHeader ? authHeader.slice(0, 25) + "..." : null,
      });
      return respond({
        ok: false,
        code: "unauthenticated",
        error: "You must be signed in to complete onboarding.",
      });
    }

    // Parsed after auth, so an anonymous caller learns nothing about the
    // request shape.
    const fields = await readFields(req);
    if (!fields) {
      return respond({
        ok: false,
        code: "invalid_request",
        error: "Expected a JSON object or multipart/form-data.",
      });
    }
    const parsed = parseOnboardingFields(fields);
    if (!parsed.ok) {
      return respond({ ok: false, code: "invalid_request", error: parsed.error });
    }
    const profile = parsed.request.mode === "profile" ? parsed.request.profile : null;

    const clerk = createClerkClient({ secretKey: clerkSecretKey });

    // Sets the onboarding flag, and the name when a profile was sent.
    // Non-fatal: proxy.ts decides who must onboard by looking for an attendees
    // row, not this flag, so a Clerk outage here shouldn't fail a request
    // whose row is already saved.
    const markOnboarded = async (name: Profile | null) => {
      try {
        await clerk.users.updateUser(clerkId, {
          ...(name && { firstName: name.firstName, lastName: name.lastName }),
          publicMetadata: { onboardingComplete: true },
        });
      } catch (syncErr) {
        console.warn("Non-fatal: Failed to update Clerk user metadata:", syncErr);
      }
    };

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Already onboarded: a row already exists for this Clerk user ID. The
    // stored profile is left alone, even if a new one was sent.
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("attendees")
      .select(ATTENDEE_COLUMNS)
      .eq("user_id", clerkId)
      .maybeSingle();

    if (existingError) {
      console.error("Attendee lookup error:", existingError);
      return respond({
        ok: false,
        code: "server_error",
        error: "Could not check attendee profile status.",
      });
    }

    if (existing) {
      await markOnboarded(null);
      return linked(existing as OnboardedAttendee, { alreadyOnboarded: true, claimed: false });
    }

    // Retrieve the user's primary email directly from Clerk.
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
      return respond({
        ok: false,
        code: "server_error",
        error: "Could not retrieve user details from Clerk.",
      });
    }

    if (!email) {
      return respond({
        ok: false,
        code: "no_email",
        error: "No email address found for this Clerk account.",
      });
    }

    // 2. Claim an orphaned guest row with matching lower(email) and user_id IS NULL.
    const { data: claimedRows, error: claimError } = await claimGuestRow(
      supabaseAdmin,
      clerkId,
      email,
      profile,
    );

    if (claimError) {
      console.error("Claim guest attendee error:", claimError);
      return respond({
        ok: false,
        code: "server_error",
        error: "Failed to link your existing check-ins: " + claimError.message,
      });
    }

    if (claimedRows && claimedRows.length > 0) {
      await markOnboarded(profile);
      return linked(claimedRows[0] as OnboardedAttendee, { alreadyOnboarded: false, claimed: true });
    }

    // Link-only, and there was nothing to link: the user has to fill in the form.
    if (!profile) {
      return respond({
        ok: true,
        success: true,
        needsProfile: true,
        alreadyOnboarded: false,
        claimed: false,
        attendee: null,
      });
    }

    // 3. Otherwise insert a fresh attendee row.
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("attendees")
      .insert({
        user_id: clerkId,
        email: email,
        first_name: profile.firstName,
        last_name: profile.lastName,
        grad_year: profile.gradYear,
      })
      .select(ATTENDEE_COLUMNS)
      .single();

    if (!insertError) {
      await markOnboarded(profile);
      return linked(inserted as OnboardedAttendee, { alreadyOnboarded: false, claimed: false });
    }

    // 23505 on attendees_email_lower_key means a row with this email exists
    // that the claim above didn't catch (e.g. concurrent guest check-in race).
    // Retry claim once rather than failing with a conflict.
    const isEmailConflict =
      insertError.code === "23505" &&
      (insertError.message?.includes("attendees_email_lower_key") ||
        insertError.details?.includes("email"));

    if (!isEmailConflict) {
      console.error("Attendee insert error:", insertError);
      return respond({
        ok: false,
        code: "server_error",
        error: "Failed to save profile: " + insertError.message,
      });
    }

    const { data: retryClaimed, error: retryError } = await claimGuestRow(
      supabaseAdmin,
      clerkId,
      email,
      profile,
    );

    if (retryClaimed && retryClaimed.length > 0) {
      await markOnboarded(profile);
      return linked(retryClaimed[0] as OnboardedAttendee, { alreadyOnboarded: false, claimed: true });
    }

    if (retryError) {
      console.error("Retry claim failed:", retryError);
    }
    return respond({
      ok: false,
      code: "email_taken",
      error:
        "This email is already linked to another account. Contact an officer if that's unexpected.",
    });
  } catch (error) {
    console.error("onboard-attendee error:", error);
    return respond({
      ok: false,
      code: "server_error",
      error: "An unexpected error occurred during onboarding.",
    });
  }
});

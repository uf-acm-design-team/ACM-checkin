import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Creates an organization: name, slug, and a full branding template (colors +
// logo). Global-admin only (attendees.admin) -- officers, even org owners,
// cannot create new orgs.
//
// Branding shape mirrors lib/branding.ts's `Branding` type. This function
// can't import that file directly (it's a separate Deno runtime with no
// access to the Next.js app's module graph), so the defaults below are
// hand-kept in sync with lib/branding.ts's DEFAULT_BRANDING. If you change
// one, change the other.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_NAME_LENGTH = 100;
const MAX_SLUG_LENGTH = 40;
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const LOGO_BUCKET = "org-logos";
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB, matches the bucket's file_size_limit
const LOGO_EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const DEFAULT_BRANDING = {
  colors: {
    primary: "#FA4616",
    background: "#0021A5",
    backgroundSecondary: "#001B87",
    accent: "#FA4616",
    text: "#FFFFFF",
  },
  particleColor: "#FFFFFF",
  logo: {
    crest: "/acm-logo.png",
    wordmark: "/acm-logo.png",
  },
};

function normalizeSlug(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
}

function sanitizeName(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

function hexOrDefault(raw: FormDataEntryValue | null, fallback: string) {
  const value = typeof raw === "string" ? raw.trim() : "";
  return HEX.test(value) ? value : fallback;
}

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
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration is missing." }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing auth token." }, 401);
  }

  try {
    // Resolve the caller's Clerk id the same way RLS does (auth.jwt() ->>
    // 'sub'), by calling the existing current_clerk_id() RPC as the caller --
    // rather than re-verifying the Clerk JWT ourselves here.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: clerkId, error: clerkIdError } = await callerClient.rpc(
      "current_clerk_id",
    );

    if (clerkIdError || !clerkId) {
      return jsonResponse(
        { error: "You must be signed in to create an organization." },
        401,
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Global admin flag, not a per-org membership role -- matches the check
    // the admin-dashboard UI already gates the "Orgs" tab on.
    const { data: adminRow, error: adminRowError } = await supabaseAdmin
      .from("attendees")
      .select("admin")
      .eq("user_id", clerkId)
      .maybeSingle();

    if (adminRowError) {
      console.error("Admin lookup failure", adminRowError);
      return jsonResponse({ error: "Could not verify admin access." }, 500);
    }

    if (!adminRow?.admin) {
      return jsonResponse(
        { error: "You are not authorized to create organizations." },
        403,
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return jsonResponse(
        { error: "Expected multipart/form-data." },
        400,
      );
    }

    const name = sanitizeName(String(form.get("name") ?? ""));
    const slug = normalizeSlug(String(form.get("slug") ?? ""));
    const ownerEmail = String(form.get("owner_email") ?? "").trim().toLowerCase();

    if (!name || name.length < 2) {
      return jsonResponse(
        { error: "Organization name must be at least 2 characters." },
        400,
      );
    }

    if (name.length > MAX_NAME_LENGTH) {
      return jsonResponse(
        { error: "Organization name must be 100 characters or fewer." },
        400,
      );
    }

    if (!slug || slug.length < 2) {
      return jsonResponse({ error: "Slug must be at least 2 characters." }, 400);
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return jsonResponse(
        { error: "Slug can only contain lowercase letters, numbers, and hyphens." },
        400,
      );
    }

    if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      return jsonResponse({ error: "Owner email is required and must be valid." }, 400);
    }

    // Fully-populated branding, same fallback contract as
    // lib/branding.ts#resolveBranding: any missing or malformed field falls
    // back to the default ACM theme.
    const branding = {
      colors: {
        primary: hexOrDefault(form.get("color_primary"), DEFAULT_BRANDING.colors.primary),
        background: hexOrDefault(form.get("color_background"), DEFAULT_BRANDING.colors.background),
        backgroundSecondary: hexOrDefault(
          form.get("color_background_secondary"),
          DEFAULT_BRANDING.colors.backgroundSecondary,
        ),
        accent: hexOrDefault(form.get("color_accent"), DEFAULT_BRANDING.colors.accent),
        text: hexOrDefault(form.get("color_text"), DEFAULT_BRANDING.colors.text),
      },
      particleColor: hexOrDefault(form.get("particle_color"), DEFAULT_BRANDING.particleColor),
      logo: {
        crest: DEFAULT_BRANDING.logo.crest,
        wordmark: DEFAULT_BRANDING.logo.wordmark,
      },
    };

    // Logo uploads are optional -- omitted ones keep the ACM default above.
    for (const field of ["crest", "wordmark"] as const) {
      const file = form.get(field);
      if (!(file instanceof File) || file.size === 0) continue;

      const ext = LOGO_EXTENSION_BY_MIME[file.type];
      if (!ext) {
        return jsonResponse(
          { error: `${field} must be a PNG, JPEG, WEBP, or SVG image.` },
          400,
        );
      }

      if (file.size > MAX_LOGO_BYTES) {
        return jsonResponse({ error: `${field} must be 2MB or smaller.` }, 400);
      }

      const path = `${slug}/${field}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(LOGO_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true });

      if (uploadError) {
        console.error(`Logo upload failed (${field}):`, uploadError);
        return jsonResponse({ error: `Failed to upload ${field}.` }, 500);
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from(LOGO_BUCKET)
        .getPublicUrl(path);

      branding.logo[field] = publicUrlData.publicUrl;
    }

    const { data: orgData, error: orgInsertError } = await supabaseAdmin
      .from("organizations")
      .insert({ name, slug, branding })
      .select("id, name, slug, branding")
      .single();

    if (orgInsertError || !orgData) {
      // 23505 = unique_violation, from organizations_slug_key.
      if (orgInsertError?.code === "23505") {
        return jsonResponse({ error: "That slug is already taken." }, 409);
      }
      return jsonResponse(
        { error: orgInsertError?.message ?? "Failed to create organization." },
        400,
      );
    }

    const { data: ownerAttendee, error: ownerLookupError } = await supabaseAdmin
      .from("attendees")
      .select("user_id")
      .eq("email", ownerEmail)
      .maybeSingle();

    if (ownerLookupError) {
      console.error("Owner lookup failed:", ownerLookupError);
      return jsonResponse({ error: "Could not resolve the owner account." }, 500);
    }

    if (!ownerAttendee?.user_id) {
      return jsonResponse(
        { error: "No registered user matches that owner email." },
        404,
      );
    }

    const { error: membershipInsertError } = await supabaseAdmin
      .from("memberships")
      .upsert(
        {
          user_id: ownerAttendee.user_id,
          org_id: orgData.id,
          role: "owner",
          status: "active",
        },
        { onConflict: "org_id,user_id" },
      );

    if (membershipInsertError) {
      console.error("Owner membership insert failed:", membershipInsertError);
      return jsonResponse(
        { error: "Organization was created, but the owner membership could not be assigned." },
        500,
      );
    }

    // This whole function runs as service_role (no end-user JWT attached to
    // supabaseAdmin's requests), so a DB trigger on organizations could never
    // resolve current_clerk_id() -- it would see no session at all. clerkId
    // was already resolved above via the caller's own client, so pass it
    // through explicitly instead of relying on an ambient trigger.
    const { error: auditError } = await supabaseAdmin.rpc("_write_audit_log", {
      p_scope: "platform",
      p_org_id: orgData.id,
      p_action: "org.created",
      p_target_type: "organization",
      p_target_id: orgData.id,
      p_metadata: { name: orgData.name, slug: orgData.slug },
      p_actor_id: clerkId,
    });
    if (auditError) {
      // Non-fatal: the org exists and is usable. Losing the audit entry is
      // unfortunate but shouldn't fail a request that already succeeded.
      console.error("Failed to write audit log for org.created:", auditError);
    }

    return jsonResponse({ success: true, organization: orgData }, 200);
  } catch (error) {
    console.error("create-org error:", error);
    return jsonResponse(
      { error: "An unexpected error occurred while creating the organization." },
      500,
    );
  }
});

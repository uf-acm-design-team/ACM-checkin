import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Edits an existing organization's branding: colors + optional new logo
// files. Owner/co-owner only.
//
// Logo uploads need the service role the same way create-org does -- the
// org-logos bucket only accepts service-role writes (see
// 20260820020000_org_logo_storage_bucket.sql), so this mirrors create-org's
// shape: authorize under the caller's own client, then do the privileged
// work (storage upload, organizations update, audit log write) with a
// service-role client.
//
// Unlike create-org, omitting a field here means "leave it unchanged," not
// "use the ACM default" -- this is an edit of a real org's existing
// branding, not a fresh creation with sensible fallbacks.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const LOGO_BUCKET = "org-logos";
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB, matches the bucket's file_size_limit
const LOGO_EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

function hexOrKeep(raw: FormDataEntryValue | null, current: string) {
  const value = typeof raw === "string" ? raw.trim() : "";
  return HEX.test(value) ? value : current;
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
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: clerkId, error: clerkIdError } = await callerClient.rpc(
      "current_clerk_id",
    );

    if (clerkIdError || !clerkId) {
      return jsonResponse(
        { error: "You must be signed in to edit organization branding." },
        401,
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return jsonResponse({ error: "Expected multipart/form-data." }, 400);
    }

    const orgId = String(form.get("org_id") ?? "").trim();
    if (!orgId) {
      return jsonResponse({ error: "org_id is required." }, 400);
    }

    // Authorization runs as the caller (not service role), so has_org_role's
    // own membership + is_global_admin() lookups apply to the real caller.
    const { data: authorized, error: authError } = await callerClient.rpc(
      "has_org_role",
      { p_org_id: orgId, p_roles: ["owner", "co-owner"] },
    );

    if (authError) {
      console.error("Authorization check failed:", authError);
      return jsonResponse({ error: "Could not verify access." }, 500);
    }

    if (!authorized) {
      return jsonResponse(
        { error: "You are not authorized to edit this organization's branding." },
        403,
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: org, error: orgFetchError } = await supabaseAdmin
      .from("organizations")
      .select("id, slug, branding")
      .eq("id", orgId)
      .maybeSingle();

    if (orgFetchError || !org) {
      return jsonResponse({ error: "Organization not found." }, 404);
    }

    // branding is jsonb and may be null for very old rows -- fall back to an
    // empty shape so the hexOrKeep/logo merges below have something to read.
    const currentBranding = (org.branding ?? {}) as {
      colors?: Record<string, string>;
      particleColor?: string;
      logo?: Record<string, string>;
    };
    const currentColors = currentBranding.colors ?? {};
    const currentLogo = currentBranding.logo ?? {};

    const branding = {
      colors: {
        primary: hexOrKeep(form.get("color_primary"), currentColors.primary ?? ""),
        background: hexOrKeep(form.get("color_background"), currentColors.background ?? ""),
        backgroundSecondary: hexOrKeep(
          form.get("color_background_secondary"),
          currentColors.backgroundSecondary ?? "",
        ),
        accent: hexOrKeep(form.get("color_accent"), currentColors.accent ?? ""),
        text: hexOrKeep(form.get("color_text"), currentColors.text ?? ""),
      },
      particleColor: hexOrKeep(form.get("particle_color"), currentBranding.particleColor ?? ""),
      logo: {
        crest: currentLogo.crest ?? "",
        wordmark: currentLogo.wordmark ?? "",
      },
    };

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

      const path = `${org.slug}/${field}-${Date.now()}.${ext}`;
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

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("organizations")
      .update({ branding })
      .eq("id", orgId)
      .select("id, name, slug, branding")
      .single();

    if (updateError || !updated) {
      return jsonResponse(
        { error: updateError?.message ?? "Failed to update branding." },
        400,
      );
    }

    // Service-role requests carry no end-user JWT, so a DB trigger could
    // never resolve current_clerk_id() here -- pass the actor explicitly,
    // same reasoning as create-org's org.created logging.
    const { error: auditError } = await supabaseAdmin.rpc("_write_audit_log", {
      p_scope: "org",
      p_org_id: orgId,
      p_action: "org.branding_updated",
      p_target_type: "organization",
      p_target_id: orgId,
      p_metadata: { name: updated.name, slug: updated.slug },
      p_actor_id: clerkId,
    });
    if (auditError) {
      console.error("Failed to write audit log for org.branding_updated:", auditError);
    }

    return jsonResponse({ success: true, organization: updated }, 200);
  } catch (error) {
    console.error("update-org-branding error:", error);
    return jsonResponse(
      { error: "An unexpected error occurred while updating branding." },
      500,
    );
  }
});

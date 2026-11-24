"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { createClerkSupabaseClient } from "../../utils/supabase/server";
import {
  normalizeSchema,
  parseSchema,
  structuralChangeError,
  validateSchema,
} from "@/lib/form-schema";
import { validateMeetingDraft } from "@/lib/meeting-validation";

// Meeting writes for the admin dashboard. RLS (meetings_officer_*) decides who
// may write; the Clerk token also lets the audit triggers record the officer.

export type MeetingActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const NOT_SIGNED_IN = "You need to be signed in.";
const ORG_NOT_FOUND = "Organization not found";
const NO_ROWS =
  "Couldn't update this meeting. It may have been deleted, or you don't have permission.";
const INVALID_QUESTIONS = "Fix the highlighted questions before saving.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Supabase = ReturnType<typeof createClerkSupabaseClient>;

async function resolveOrg(
  supabase: Supabase,
  orgSlug: unknown,
): Promise<{ id: string; slug: string } | null> {
  if (typeof orgSlug !== "string" || !orgSlug) return null;
  const { data } = await supabase
    .from("organizations")
    .select("id, slug")
    .eq("slug", orgSlug)
    .maybeSingle();
  return data;
}

// Nothing caches meetings today; this keeps the stats page correct if that changes.
const revalidateOrgStats = (slug: string) => revalidatePath(`/${slug}/stats`);

export async function createMeeting(
  orgSlug: string,
  draft: unknown,
): Promise<MeetingActionResult<{ id: string }>> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: NOT_SIGNED_IN };

  const validated = validateMeetingDraft(draft);
  if (!validated.ok) return validated;

  const supabase = createClerkSupabaseClient();
  const org = await resolveOrg(supabase, orgSlug);
  if (!org) return { ok: false, error: ORG_NOT_FOUND };

  const { data, error } = await supabase
    .from("meetings")
    .insert({ ...validated.value, org_id: org.id, created_by: userId })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidateOrgStats(org.slug);
  return { ok: true, id: data.id };
}

export async function updateMeeting(
  orgSlug: string,
  meetingId: string,
  draft: unknown,
  formSchema: unknown,
): Promise<MeetingActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: NOT_SIGNED_IN };
  if (typeof meetingId !== "string" || !UUID.test(meetingId)) {
    return { ok: false, error: NO_ROWS };
  }

  const validated = validateMeetingDraft(draft);
  if (!validated.ok) return validated;

  if (!Array.isArray(formSchema)) return { ok: false, error: INVALID_QUESTIONS };
  const parsed = parseSchema(formSchema);
  if (validateSchema(parsed).length > 0) return { ok: false, error: INVALID_QUESTIONS };
  const schema = normalizeSchema(parsed);

  const supabase = createClerkSupabaseClient();
  const org = await resolveOrg(supabase, orgSlug);
  if (!org) return { ok: false, error: ORG_NOT_FOUND };

  // Mirrors the builder's lock: once check-ins exist, answers must keep their questions.
  const { data: current, error: currentError } = await supabase
    .from("meetings")
    .select("form_schema")
    .eq("id", meetingId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (currentError) return { ok: false, error: currentError.message };
  if (!current) return { ok: false, error: NO_ROWS };

  const { count, error: countError } = await supabase
    .from("attendance")
    .select("id", { count: "exact", head: true })
    .eq("meeting_id", meetingId);
  if (countError) return { ok: false, error: countError.message };
  if (count) {
    const structural = structuralChangeError(
      normalizeSchema(parseSchema(current.form_schema)),
      schema,
    );
    if (structural) return { ok: false, error: structural };
  }

  const { data, error } = await supabase
    .from("meetings")
    .update({ ...validated.value, form_schema: schema })
    .eq("id", meetingId)
    .eq("org_id", org.id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: NO_ROWS };

  revalidateOrgStats(org.slug);
  return { ok: true };
}

export async function setMeetingStatus(
  orgSlug: string,
  meetingId: string,
  status: boolean,
): Promise<MeetingActionResult<{ status: boolean }>> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: NOT_SIGNED_IN };
  if (typeof meetingId !== "string" || !UUID.test(meetingId) || typeof status !== "boolean") {
    return { ok: false, error: NO_ROWS };
  }

  const supabase = createClerkSupabaseClient();
  const org = await resolveOrg(supabase, orgSlug);
  if (!org) return { ok: false, error: ORG_NOT_FOUND };

  // An RLS-blocked update returns no error, only zero rows.
  const { data, error } = await supabase
    .from("meetings")
    .update({ status })
    .eq("id", meetingId)
    .eq("org_id", org.id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: NO_ROWS };

  revalidateOrgStats(org.slug);
  return { ok: true, status };
}

export async function deleteMeeting(
  orgSlug: string,
  meetingId: string,
): Promise<MeetingActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: NOT_SIGNED_IN };
  if (typeof meetingId !== "string" || !UUID.test(meetingId)) {
    return { ok: false, error: NO_ROWS };
  }

  const supabase = createClerkSupabaseClient();
  const org = await resolveOrg(supabase, orgSlug);
  if (!org) return { ok: false, error: ORG_NOT_FOUND };

  // Same as update: a blocked delete is zero rows, not an error.
  const { data, error } = await supabase
    .from("meetings")
    .delete()
    .eq("id", meetingId)
    .eq("org_id", org.id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: NO_ROWS };

  revalidateOrgStats(org.slug);
  return { ok: true };
}

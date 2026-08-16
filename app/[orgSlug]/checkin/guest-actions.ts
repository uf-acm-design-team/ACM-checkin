"use server";

import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { parseSchema, validateAnswers } from "@/lib/form-schema";

/**
 * Guest check-in, performed server-side.
 *
 * Why this exists rather than writing from the browser:
 *
 *  1. `anon` has INSERT on attendees but no SELECT (by design -- the table
 *     holds names, emails and grad years, and a public read would expose the
 *     whole membership). The client flow did
 *         .insert({...}).select("id").single()
 *     which is an insert *with a read-back*; PostgREST needs SELECT for that
 *     and rejects the whole statement as
 *         42501 new row violates row-level security policy
 *     -- a misleading error, since the INSERT itself is allowed. Verified: the
 *     same insert with `Prefer: return=minimal` returns 201.
 *
 *  2. The duplicate-check-in lookup has the same problem: anon cannot SELECT
 *     from attendance either, so the client-side guard silently found nothing.
 *
 *  3. Rate limiting needs a trust boundary. Anything enforced in the browser is
 *     advisory; the public check-in route is otherwise scriptable.
 *
 * Uses the service-role key, so every rule below is enforced here in code
 * rather than by RLS. Keep the checks strict.
 */

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

// In-memory, per-server-instance. Good enough to stop a naive script hammering
// the endpoint from one address; it does NOT survive a redeploy and is not
// shared across serverless instances. For real protection put a durable store
// (Upstash/Redis) or an edge rate limiter in front of this.
const attempts = new Map<string, number[]>();

function rateLimit(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT_MAX) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(now);
  attempts.set(key, recent);

  // Opportunistic cleanup so the map can't grow without bound.
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) {
      if (v.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) attempts.delete(k);
    }
  }
  return true;
}

function admin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

export type GuestCheckInResult =
  | { ok: true; alreadyCheckedIn?: boolean }
  | { ok: false; error: string; answerErrors?: Record<string, string> };

export async function guestCheckIn(input: {
  orgSlug: string;
  email: string;
  answers?: unknown;
  firstName?: string;
  lastName?: string;
  gradYear?: string;
}): Promise<GuestCheckInResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";

  if (!rateLimit(`ip:${ip}`) || !rateLimit(`email:${email}`)) {
    return {
      ok: false,
      error: "Too many attempts. Wait a minute and try again.",
    };
  }

  const supabase = admin();

  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", input.orgSlug)
    .maybeSingle();
  if (!org) return { ok: false, error: "Club does not exist." };

  // The meeting must be open right now. Never trust a meeting id from the
  // client -- resolve the active one server-side so a guest cannot backfill a
  // closed meeting by replaying an old id.
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, form_schema")
    .eq("org_id", org.id)
    .eq("status", true)
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!meeting) return { ok: false, error: "There is no active meeting." };

  // Validate answers against the schema READ HERE, never one supplied by the
  // caller. This endpoint is public and unauthenticated, so the browser copy of
  // this check (checkin/page.tsx) is advisory only -- without this pass a
  // scripted caller could write arbitrary jsonb into attendance.answers, or
  // skip a required question entirely.
  //
  // Checked before the attendee is created so a rejected form doesn't leave a
  // half-finished profile row behind.
  const schema = parseSchema(meeting.form_schema);
  const validated = validateAnswers(schema, input.answers);
  if (!validated.ok) {
    return {
      ok: false,
      error: "Answer the required questions before checking in.",
      answerErrors: validated.errors,
    };
  }

  // Find or create the attendee. Matched case-insensitively to line up with the
  // unique index on lower(email) from 20260813000000.
  const { data: existing } = await supabase
    .from("attendees")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  let attendeeId = existing?.id as string | undefined;

  if (!attendeeId) {
    const first = input.firstName?.trim();
    const last = input.lastName?.trim();
    const grad = input.gradYear?.trim();
    if (!first || !last || !grad) {
      return { ok: false, error: "NEEDS_PROFILE" };
    }

    const { data: created, error: createError } = await supabase
      .from("attendees")
      .insert({
        email,
        first_name: first,
        last_name: last,
        grad_year: grad,
        // Left NULL: this person has no Clerk account. Signing up later with
        // the same address relinks this row (see checkin/page.tsx).
        user_id: null,
      })
      .select("id")
      .single();

    if (createError || !created) {
      return {
        ok: false,
        error: createError?.message ?? "Couldn't create your profile.",
      };
    }
    attendeeId = created.id;
  }

  const { error: attendanceError } = await supabase.from("attendance").insert({
    attendee_id: attendeeId,
    org_id: org.id,
    meeting_id: meeting.id,
    source: "guest",
    // NULL rather than {} when the meeting asks nothing, matching how the
    // migration normalized historical rows.
    answers:
      Object.keys(validated.answers).length > 0 ? validated.answers : null,
  });

  if (attendanceError) {
    // 23505 = the unique (meeting_id, attendee_id) constraint from
    // 20260813000000. Reaching it means a duplicate check-in, which is a
    // success from the guest's point of view, not an error.
    if (attendanceError.code === "23505") {
      return { ok: true, alreadyCheckedIn: true };
    }
    return { ok: false, error: attendanceError.message };
  }

  return { ok: true };
}

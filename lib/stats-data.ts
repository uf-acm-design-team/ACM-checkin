"use server";

import { auth } from "@clerk/nextjs/server";
import { unstable_cache } from "next/cache";
// NOTE: We query with the anon client, not the Clerk-token client. RLS is off
// and identity is enforced in app code (attendeeId is derived server-side from
// auth() and every attendance read is filtered by it). Forwarding the Clerk
// token to Supabase only works once Clerk is registered as a third-party auth
// provider; until then Supabase rejects it ("No suitable key to decode the
// JWT"). createClerkSupabaseClient remains the RLS-ready path for that future.
import { createAnonSupabaseClient } from "@/app/utils/supabase/server";
import { resolveMembership } from "@/lib/membership";
import { parseAnswers, parseSchema, type AnswerMap } from "@/lib/form-schema";
import {
  academicYearTerms,
  buildTermSummaries,
  hasMore,
  pageRange,
  termBounds,
  type MemberStats,
  type MeetingDetails,
  type Page,
  type Scope,
  type StatsMeeting,
  type View,
} from "@/lib/stats-terms";

// Current time as EST wall-clock parts + an ISO string usable for tz-less
// `start_time` comparisons (meetings.start_time is timestamp WITHOUT time zone,
// and all club times are EST).
function nowEst(): { year: number; month: number; iso: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const p = Object.fromEntries(
    fmt.formatToParts(new Date()).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return {
    year: Number(p.year),
    month: Number(p.month),
    iso: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`,
  };
}

export async function getMemberStats(orgSlug: string): Promise<MemberStats> {
  const { userId } = await auth();
  const supabase = createAnonSupabaseClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .single();
  if (!org) throw new Error("ORG_NOT_FOUND");

  let attendeeId: string | null = null;
  let role: string | null = null;
  let status: string | null = null;

  if (userId) {
    const { data: attendee } = await supabase
      .from("attendees").select("id").eq("user_id", userId).maybeSingle();
    attendeeId = attendee?.id ?? null;

    const { data: membership } = await supabase
      .from("memberships").select("role, status")
      .eq("org_id", org.id).eq("user_id", userId).maybeSingle();
    role = membership?.role ?? null;
    status = membership?.status ?? null;
  }

  const now = nowEst();

  // Cached: org meeting totals change only when officers add/edit meetings.
  // Keyed on orgId (NOT on now — that would defeat the cache). We fetch all org
  // meetings and filter "occurred" in JS below. Invalidate on meeting
  // create/update via revalidateTag(`org-meetings:${org.id}`).
  // Uses the anon client (not the Clerk client): unstable_cache forbids reading
  // request headers, and the Clerk client's accessToken callback calls auth().
  // Org meetings are non-sensitive and RLS is off, so no token is needed.
  const loadOrgMeetings = unstable_cache(
    async () => {
      const anon = createAnonSupabaseClient();
      const { data } = await anon
        .from("meetings")
        .select("id, start_time")
        .eq("org_id", org.id);
      return data ?? [];
    },
    ["org-meetings", org.id],
    { tags: [`org-meetings:${org.id}`], revalidate: 300 },
  );
  const orgMeetings = (await loadOrgMeetings()).filter(
    (m) => m.start_time <= now.iso,
  );

  let attendedIds = new Set<string>();
  if (attendeeId) {
    const { data: att } = await supabase
      .from("attendance")
      .select("meeting_id")
      .eq("org_id", org.id)
      .eq("attendee_id", attendeeId);
    attendedIds = new Set((att ?? []).map((a) => a.meeting_id as string));
  }

  const { terms: allTerms, totalAllTime, attendedAllTime } =
    buildTermSummaries(orgMeetings, attendedIds);

  const ayKeys = new Set(academicYearTerms(now.year, now.month));
  const terms = allTerms.filter((t) => ayKeys.has(t.key) && t.total > 0);

  const { threshold, isMember, remaining } = resolveMembership(
    role, status, attendedAllTime, org.slug,
  );

  return {
    orgId: org.id,
    orgName: org.name,
    attendeeId,
    role,
    status,
    isMember,
    threshold,
    remaining,
    attendedAllTime,
    totalAllTime,
    terms,
  };
}

export async function getMeetingsPage(
  orgId: string,
  scope: Scope,
  view: View,
  page: number,
  pageSize = 10,
): Promise<Page<StatsMeeting>> {
  const { userId } = await auth();
  const supabase = createAnonSupabaseClient();
  const now = nowEst();

  // Window (always capped at now — occurred meetings only).
  let startIso = "0001-01-01T00:00:00";
  let endIso = now.iso;
  if (scope !== "all") {
    const b = termBounds(scope);
    startIso = b.startIso;
    endIso = b.endIso < now.iso ? b.endIso : now.iso;
  }

  // Resolve the attendee server-side so the DB can compute the attended/missed
  // filter and the per-meeting attended flag itself. This deliberately avoids
  // shipping the user's attended-meeting id list into the request URL (the old
  // id=in.(...) / not.in.(...) approach), which could blow past the URL length
  // limit for members with long attendance histories. See the RPC migration
  // 20260712000000_get_member_meetings_page.sql.
  let attendeeId: string | null = null;
  if (userId) {
    const { data: attendee } = await supabase
      .from("attendees").select("id").eq("user_id", userId).maybeSingle();
    attendeeId = attendee?.id ?? null;
  }

  const { from } = pageRange(page, pageSize);

  const { data } = await supabase.rpc("get_member_meetings_page", {
    p_org_id: orgId,
    p_attendee_id: attendeeId,
    p_start: startIso,
    p_end: endIso,
    p_view: view,
    p_limit: pageSize,
    p_offset: from,
  });

  const rows = (data ?? []) as {
    id: string; title: string; start_time: string;
    description: string | null; form_schema: unknown;
    attended: boolean; total_count: number | string;
  }[];

  // total_count is a window count identical on every row (bigint may arrive as
  // a string); 0 when the filtered set is empty.
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

  const items: StatsMeeting[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    start_time: row.start_time,
    attended: row.attended,
    description: row.description ?? undefined,
    hasDetails:
      Boolean(row.description?.trim()) || parseSchema(row.form_schema).length > 0,
  }));

  return { items, total, page, pageSize, hasMore: hasMore(page, pageSize, total) };
}

export async function getMeetingDetails(meetingId: string): Promise<MeetingDetails> {
  const { userId } = await auth();
  const supabase = createAnonSupabaseClient();

  const { data: m } = await supabase
    .from("meetings")
    .select("id, title, start_time, end_time, description, form_schema")
    .eq("id", meetingId)
    .single();
  if (!m) throw new Error("MEETING_NOT_FOUND");

  const meeting = m as {
    id: string; title: string; start_time: string;
    end_time: string | null; description: string | null; form_schema: unknown;
  };
  const questions = parseSchema(meeting.form_schema);

  // null means "didn't attend" and is what the modal keys off to show its
  // did-not-attend note -- distinct from an empty map, which means attended but
  // answered nothing.
  let answers: AnswerMap | null = null;
  if (userId) {
    const { data: attendee } = await supabase
      .from("attendees").select("id").eq("user_id", userId).maybeSingle();
    if (attendee?.id) {
      const { data: att } = await supabase
        .from("attendance")
        .select("answers")
        .eq("meeting_id", meetingId)
        .eq("attendee_id", attendee.id)
        .maybeSingle();
      if (att) answers = parseAnswers(att.answers);
    }
  }

  return {
    id: meeting.id, title: meeting.title, start_time: meeting.start_time,
    end_time: meeting.end_time ?? null, description: meeting.description ?? null,
    questions, answers,
  };
}

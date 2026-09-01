"use server";

import { auth } from "@clerk/nextjs/server";
// NOTE: We query with the service-role client, not the anon or Clerk-token
// client. RLS is ON (20260813000100_enable_rls_clerk.sql) and its anon
// policies only expose organizations and *active* meetings -- nowhere near
// enough for a stats page (memberships/attendance have no anon SELECT grant
// at all, and every meeting the auto-close cron has closed becomes invisible
// to anon). Identity is instead enforced in app code: attendeeId/org
// membership are derived server-side from auth() and every read below is
// filtered by them, the same pattern app/[orgSlug]/checkin/guest-actions.ts
// uses for the same reason.
import { createServiceSupabaseClient } from "@/app/utils/supabase/server";
import { resolveMembership } from "@/lib/membership";
import { parseAnswers, parseSchema, type AnswerMap } from "@/lib/form-schema";
import { orgWallClock } from "@/lib/meeting-time";
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

// "Now" as a real instant, plus the org-local year/month used to pick which
// academic year's terms to show.
//
// This used to return a bare Eastern wall-clock string ("2026-09-01T14:30:00")
// for comparison against `start_time`. That was correct while the column was
// `timestamp without time zone`, but 20260827000000 converted it to timestamptz
// and PostgREST now returns "2026-09-01T18:30:00+00:00". Comparing the two as
// STRINGS (which is what the occurred-meetings filter did) comes out backwards:
// the UTC form's hour digits run 4-5 hours ahead, so every meeting held within
// the last offset-width dropped out of the totals -- a member's check-in landed
// but their count didn't move until hours later.
//
// Both halves are now true instants, so the comparison is an instant
// comparison and holds across DST. The year/month still come from the ORG's
// zone, never the server's, so a late-December meeting files under the right
// term.
function nowInstant(): { year: number; month: number; iso: string } {
  const now = new Date();
  const wc = orgWallClock(now.toISOString());
  return {
    // orgWallClock only returns null for an unparseable string, which
    // toISOString() cannot produce; the fallback keeps the type honest.
    year: wc?.year ?? now.getUTCFullYear(),
    month: wc?.month ?? now.getUTCMonth() + 1,
    iso: now.toISOString(),
  };
}

export async function getMemberStats(orgSlug: string): Promise<MemberStats> {
  const { userId } = await auth();
  const supabase = createServiceSupabaseClient();

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

  const now = nowInstant();

  // Read the org's meetings live rather than through unstable_cache.
  //
  // This used to be wrapped in unstable_cache({ revalidate: 300 }) whose
  // comment promised invalidation via revalidateTag(`org-meetings:<id>`) on
  // meeting create/update. That call was never written, and it could not be:
  // officers create, toggle and delete meetings with the BROWSER supabase
  // client in app/[orgSlug]/admin-dashboard/page.tsx, so there is no server
  // action in the write path to revalidate from. The tag was therefore dead
  // and every officer edit took up to five minutes to reach the stats page.
  //
  // Worse, the list below it (get_member_meetings_page) was never cached, so
  // the header counts and the meeting list were served from two different
  // points in time and could disagree on screen.
  //
  // The query is one indexed `select id, start_time where org_id = ?`. That is
  // cheap enough that caching it is not worth a five-minute skew between the
  // two halves of the same page. If this ever needs a cache again, move the
  // meeting writes into server actions FIRST so the tag can actually be
  // invalidated.
  const { data: allOrgMeetings } = await supabase
    .from("meetings")
    .select("id, start_time")
    .eq("org_id", org.id);

  // Occurred meetings only. Both sides are real instants (start_time is
  // timestamptz; now.iso is toISOString()), so this is an instant comparison,
  // not the string comparison that used to silently drop the last few hours.
  const nowMs = Date.parse(now.iso);
  const orgMeetings = (allOrgMeetings ?? []).filter(
    (m) => Date.parse(m.start_time) <= nowMs,
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
  const supabase = createServiceSupabaseClient();
  const now = nowInstant();

  // Window (always capped at now -- occurred meetings only).
  //
  // Every bound here is a real instant: termBounds() returns them via
  // fromDateTimeLocal, and now.iso is toISOString(). The cap used to compare
  // an offset-bearing bound against a bare wall-clock string, which is not a
  // meaningful ordering; it is now a numeric instant comparison.
  const nowMs = Date.parse(now.iso);
  // A "before any meeting" sentinel, as an instant rather than the old bare
  // "0001-01-01T00:00:00" -- p_start is timestamptz now, and this keeps the
  // unbounded lower edge genuinely unbounded instead of quietly starting at
  // the epoch.
  let startIso = new Date(Date.UTC(1, 0, 1)).toISOString();
  let endIso = now.iso;
  if (scope !== "all") {
    const b = termBounds(scope);
    startIso = b.startIso;
    endIso = Date.parse(b.endIso) < nowMs ? b.endIso : now.iso;
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
  // This is a server action, so it is a callable endpoint: the only thing
  // standing between an arbitrary meeting UUID and this data is the check
  // below. This uses the service-role client (see the note at the top of this
  // file), so RLS isn't the backstop here -- identity has to be enforced here
  // in app code. Signing out is not enough -- a signed-in member of club A
  // must not be able to read club B's meeting by id.
  if (!userId) throw new Error("MEETING_NOT_FOUND");

  const supabase = createServiceSupabaseClient();

  const { data: m } = await supabase
    .from("meetings")
    .select("id, org_id, title, start_time, end_time, description, form_schema")
    .eq("id", meetingId)
    .single();
  if (!m) throw new Error("MEETING_NOT_FOUND");

  const meeting = m as {
    id: string; org_id: string; title: string; start_time: string;
    end_time: string | null; description: string | null; form_schema: unknown;
  };

  // Caller must belong to the org that owns this meeting. Reported as
  // MEETING_NOT_FOUND rather than a distinct "forbidden" so the response
  // cannot be used to probe which meeting ids exist.
  const { data: callerMembership } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("org_id", meeting.org_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!callerMembership) throw new Error("MEETING_NOT_FOUND");

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

import type { PostgrestError, QueryData } from "@supabase/supabase-js";
import type { MobileSupabase, TypedSupabaseClient } from "./client";
import type { Database, Tables } from "./database.types";

import { orgWallClock } from "../../../../supabase/functions/_shared/meeting-time";
import { nextMeeting } from "../../../../supabase/functions/_shared/next-meeting";

export type Attendee = Tables<"attendees">;

export class DataError extends Error {
  readonly query: string;
  readonly code: string | undefined;
  readonly authRejected: boolean;

  constructor(query: string, error: Pick<PostgrestError, "message" | "code">) {
    const authRejected =
      typeof error.code === "string" && error.code.startsWith("PGRST30");
    super(
      authRejected
        ? `${query}: Supabase rejected the Clerk token (${error.code}). Check that Clerk is registered as a third-party auth provider for this Supabase project.`
        : `${query}: ${error.message}`,
    );
    this.name = "DataError";
    this.query = query;
    this.code = error.code;
    this.authRejected = authRejected;
  }
}

const orgColumns = "id, slug, name, branding, created_at";

const membershipsQuery = (client: TypedSupabaseClient, clerkId: string) =>
  client
    .from("memberships")
    .select(
      `org_id, role, status, created_at, organization:organizations(${orgColumns})`,
    )
    .eq("user_id", clerkId);

const orgBySlugQuery = (client: TypedSupabaseClient, slug: string) =>
  client
    .from("organizations")
    .select(orgColumns)
    .eq("slug", slug)
    .maybeSingle();

export type MyMembership = QueryData<
  ReturnType<typeof membershipsQuery>
>[number];
export type Organization = NonNullable<
  QueryData<ReturnType<typeof orgBySlugQuery>>
>;

export async function getMyAttendee(
  supabase: MobileSupabase | null,
): Promise<Attendee | null> {
  if (!supabase) return null;
  const clerkId = await supabase.clerkId();
  if (!clerkId) return null;

  const { data, error } = await supabase.client
    .from("attendees")
    .select("*")
    .eq("user_id", clerkId)
    .maybeSingle();
  if (error) throw new DataError("getMyAttendee", error);
  return data;
}

export async function getMyMemberships(
  supabase: MobileSupabase | null,
): Promise<MyMembership[]> {
  if (!supabase) return [];
  const clerkId = await supabase.clerkId();
  if (!clerkId) return [];

  const { data, error } = await membershipsQuery(supabase.client, clerkId);
  if (error) throw new DataError("getMyMemberships", error);
  return data ?? [];
}

export async function getOrgBySlug(
  supabase: MobileSupabase | null,
  slug: string,
): Promise<Organization | null> {
  if (!supabase || !slug) return null;

  const { data, error } = await orgBySlugQuery(supabase.client, slug);
  if (error) throw new DataError("getOrgBySlug", error);
  return data;
}

export type HomeMeeting = {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
};

export type HomeOrg = {
  org: Organization;
  role: string;
  status: string | null;
  attended: number;
  // What the club does next (the website's "Next Meeting" rule), or null.
  nextMeeting: HomeMeeting | null;
  // You checked in to one of the club's meetings that started today (Eastern).
  checkedInToday: boolean;
};

export type HomeAttendance = { org_id: string; meeting_id: string };

export type HomeMeetingRow = {
  id: string;
  org_id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  status: boolean | null;
};

const orgDay = (iso: string) => {
  const wc = orgWallClock(iso);
  return wc ? `${wc.year}-${wc.month}-${wc.day}` : null;
};

export function buildHomeOrgs(
  memberships: MyMembership[],
  attendance: HomeAttendance[],
  meetings: HomeMeetingRow[] = [],
  now: Date = new Date(),
): HomeOrg[] {
  const counts = new Map<string, number>();
  for (const row of attendance)
    counts.set(row.org_id, (counts.get(row.org_id) ?? 0) + 1);
  const attendedIds = new Set(attendance.map((row) => row.meeting_id));
  const today = orgDay(now.toISOString());

  return memberships
    .filter((membership) => membership.organization)
    .map((membership) => {
      const orgMeetings = meetings.filter((m) => m.org_id === membership.org_id);
      const next = nextMeeting(orgMeetings, now.getTime());
      return {
        org: membership.organization,
        role: membership.role,
        status: membership.status,
        attended: counts.get(membership.org_id) ?? 0,
        nextMeeting: next
          ? { id: next.id, title: next.title, startTime: next.start_time, endTime: next.end_time }
          : null,
        checkedInToday: orgMeetings.some(
          (m) => attendedIds.has(m.id) && orgDay(m.start_time) === today,
        ),
      };
    })
    .sort((a, b) => (a.org.name ?? "").localeCompare(b.org.name ?? ""));
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getMyHomeOrgs(
  supabase: MobileSupabase | null,
  now: Date = new Date(),
): Promise<HomeOrg[]> {
  if (!supabase) return [];

  const [memberships, attendee] = await Promise.all([
    getMyMemberships(supabase),
    getMyAttendee(supabase),
  ]);
  if (memberships.length === 0 || !attendee)
    return buildHomeOrgs(memberships, [], [], now);

  // Meetings still to come, plus any from the last day so today's meetings
  // (for "checked in today") are there even once they've ended. RLS limits
  // this to meetings a member of these orgs may see.
  const [attendance, meetings] = await Promise.all([
    supabase.client
      .from("attendance")
      .select("org_id, meeting_id")
      .eq("attendee_id", attendee.id),
    supabase.client
      .from("meetings")
      .select("id, org_id, title, start_time, end_time, status")
      .in("org_id", memberships.map((m) => m.org_id))
      .or(`start_time.gte.${new Date(now.getTime() - DAY_MS).toISOString()},end_time.gte.${now.toISOString()}`),
  ]);
  if (attendance.error) throw new DataError("getMyHomeOrgs", attendance.error);
  if (meetings.error) throw new DataError("getMyHomeOrgs", meetings.error);

  // A meeting with no start time can't be placed on a calendar, so it's never next.
  const scheduled = (meetings.data ?? []).flatMap((m) =>
    m.start_time ? [{ ...m, start_time: m.start_time }] : [],
  );
  return buildHomeOrgs(memberships, attendance.data ?? [], scheduled, now);
}

export type MeetingQuestion = { id: string; label: string };

export type OrgMeeting = {
  id: string;
  title: string;
  startTime: string;
  attended: boolean;
  description: string | null;
  // The meeting's check-in questions, for labelling your answers.
  questions: MeetingQuestion[];
};

// form_schema is jsonb, so read it defensively: keep entries with an id and a label.
function meetingQuestions(schema: unknown): MeetingQuestion[] {
  if (!Array.isArray(schema)) return [];
  return schema.flatMap((entry) => {
    const { id, label } = (entry ?? {}) as { id?: unknown; label?: unknown };
    return typeof id === "string" && typeof label === "string" ? [{ id, label }] : [];
  });
}

const MEETINGS_PAGE_SIZE = 100;

type MeetingPageRow =
  Database["public"]["Functions"]["get_member_meetings_page"]["Returns"][number];

export async function getMyOrgMeetings(
  supabase: MobileSupabase | null,
  orgId: string,
  window: { start: string; end: string },
): Promise<{ meetings: OrgMeeting[]; total: number }> {
  if (!supabase) return { meetings: [], total: 0 };
  const attendee = await getMyAttendee(supabase);
  if (!attendee) return { meetings: [], total: 0 };

  // The list and the calendar both need every meeting in the window, so page
  // through the RPC until we have them all instead of stopping at one page.
  const rows: MeetingPageRow[] = [];
  let total = 0;
  do {
    const { data, error } = await supabase.client.rpc("get_member_meetings_page", {
      p_org_id: orgId,
      p_attendee_id: attendee.id,
      p_start: window.start,
      p_end: window.end,
      p_view: "all",
      p_limit: MEETINGS_PAGE_SIZE,
      p_offset: rows.length,
    });
    if (error) throw new DataError("getMyOrgMeetings", error);
    const page = data ?? [];
    if (page.length === 0) break;
    rows.push(...page);
    // total_count is the same on every row.
    total = Number(page[0].total_count);
  } while (rows.length < total);

  return {
    meetings: rows.map((row) => ({
      id: row.id,
      title: row.title,
      startTime: row.start_time,
      attended: row.attended,
      description: row.description || null,
      questions: meetingQuestions(row.form_schema),
    })),
    total,
  };
}

export type MeetingCheckIn = {
  endTime: string | null;
  // Null when you didn't check in to this meeting.
  checkedInAt: string | null;
  answers: Record<string, unknown>;
};

// What the meeting details sheet adds to a list row: when the meeting ends,
// and your own check-in to it (RLS only returns your attendance row).
export async function getMyMeetingCheckIn(
  supabase: MobileSupabase | null,
  meetingId: string,
): Promise<MeetingCheckIn> {
  const none = { endTime: null, checkedInAt: null, answers: {} };
  if (!supabase) return none;
  const attendee = await getMyAttendee(supabase);
  if (!attendee) return none;

  const [meeting, attendance] = await Promise.all([
    supabase.client.from("meetings").select("end_time").eq("id", meetingId).maybeSingle(),
    supabase.client
      .from("attendance")
      .select("checked_in_at, answers")
      .eq("meeting_id", meetingId)
      .eq("attendee_id", attendee.id)
      .maybeSingle(),
  ]);
  if (meeting.error) throw new DataError("getMyMeetingCheckIn", meeting.error);
  if (attendance.error) throw new DataError("getMyMeetingCheckIn", attendance.error);

  const answers = attendance.data?.answers;
  return {
    endTime: meeting.data?.end_time ?? null,
    checkedInAt: attendance.data?.checked_in_at ?? null,
    answers:
      answers && typeof answers === "object" && !Array.isArray(answers)
        ? (answers as Record<string, unknown>)
        : {},
  };
}

import type { PostgrestError, QueryData } from "@supabase/supabase-js";
import { parseSchema, type FormSchema } from "../check-in-form";
import { isWithinMeetingWindow } from "../meeting-time";
import type { MobileSupabase, TypedSupabaseClient } from "./client";
import type { Tables } from "./database.types";

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

// Never `*`: checkin_password is column-revoked from anon and authenticated
// (20260826000000_meeting_levels_and_password.sql), so selecting it fails, and
// the app must never hold it anyway. requires_checkin_password is the safe,
// generated flag that says whether to show the password field.
const openMeetingColumns =
  "id, title, description, start_time, end_time, is_geo_locked, latitude, longitude, radius_meters, requires_checkin_password, form_schema";

const openMeetingsQuery = (client: TypedSupabaseClient, orgId: string) =>
  client
    .from("meetings")
    .select(openMeetingColumns)
    .eq("org_id", orgId)
    .eq("status", true)
    .order("start_time", { ascending: true });

export type OpenMeeting = Omit<
  QueryData<ReturnType<typeof openMeetingsQuery>>[number],
  "form_schema"
> & { form_schema: FormSchema };

/**
 * The org's meetings a member can check into right now, earliest first, with
 * their questions parsed. Same query as the web check-in page and the
 * member-check-in function.
 *
 * Uses the Clerk client: meetings_member_read hides officer-only meetings from
 * anyone below officer, so the list is exactly what this user may check into.
 * The same policy also shows members their org's closed meetings, which is why
 * the status filter matters. status=true is only the officer's switch, so the
 * scheduled window is checked here too, like the server does.
 */
export async function getOpenMeetings(
  supabase: MobileSupabase | null,
  orgId: string,
  now: Date = new Date(),
): Promise<OpenMeeting[]> {
  if (!supabase || !orgId) return [];

  const { data, error } = await openMeetingsQuery(supabase.client, orgId);
  if (error) throw new DataError("getOpenMeetings", error);

  return (data ?? [])
    .filter((meeting) =>
      isWithinMeetingWindow(now, meeting.start_time, meeting.end_time),
    )
    .map((meeting) => ({
      ...meeting,
      form_schema: parseSchema(meeting.form_schema),
    }));
}

export type LiveMeeting = {
  id: string;
  orgId: string;
  title: string;
  endTime: string | null;
};

/**
 * The meetings in these orgs that are open for check-in right now: the
 * officer's switch is on and the scheduled window includes `now`, the same
 * rule as getOpenMeetings. One query for all the orgs on Home.
 */
export async function getLiveMeetings(
  supabase: MobileSupabase | null,
  orgIds: string[],
  now: Date = new Date(),
): Promise<LiveMeeting[]> {
  if (!supabase || orgIds.length === 0) return [];

  const { data, error } = await supabase.client
    .from("meetings")
    .select("id, org_id, title, start_time, end_time")
    .in("org_id", orgIds)
    .eq("status", true)
    .order("start_time", { ascending: true });
  if (error) throw new DataError("getLiveMeetings", error);

  return (data ?? [])
    .filter((meeting) =>
      isWithinMeetingWindow(now, meeting.start_time, meeting.end_time),
    )
    .map((meeting) => ({
      id: meeting.id,
      orgId: meeting.org_id,
      title: meeting.title,
      endTime: meeting.end_time,
    }));
}

export type HomeOrg = {
  org: Organization;
  role: string;
  status: string | null;
  attended: number;
};

export function buildHomeOrgs(
  memberships: MyMembership[],
  attendanceOrgIds: string[],
): HomeOrg[] {
  const counts = new Map<string, number>();
  for (const orgId of attendanceOrgIds)
    counts.set(orgId, (counts.get(orgId) ?? 0) + 1);

  return memberships
    .filter((membership) => membership.organization)
    .map((membership) => ({
      org: membership.organization,
      role: membership.role,
      status: membership.status,
      attended: counts.get(membership.org_id) ?? 0,
    }))
    .sort((a, b) => (a.org.name ?? "").localeCompare(b.org.name ?? ""));
}

export async function getMyHomeOrgs(
  supabase: MobileSupabase | null,
): Promise<HomeOrg[]> {
  if (!supabase) return [];

  const [memberships, attendee] = await Promise.all([
    getMyMemberships(supabase),
    getMyAttendee(supabase),
  ]);
  if (memberships.length === 0 || !attendee)
    return buildHomeOrgs(memberships, []);

  const { data, error } = await supabase.client
    .from("attendance")
    .select("org_id")
    .eq("attendee_id", attendee.id);
  if (error) throw new DataError("getMyHomeOrgs", error);

  return buildHomeOrgs(
    memberships,
    (data ?? []).map((row) => row.org_id),
  );
}

// One of your check-ins: which org, when that meeting started, and its title.
export type MyCheckIn = { orgId: string; startTime: string; title?: string | null };

export type MyProfile = {
  attendee: Attendee | null;
  memberships: MyMembership[];
  checkIns: MyCheckIn[];
};

// Everything the profile tab needs. meetings only grants listed columns, so
// the join names start_time rather than selecting *.
export async function getMyProfile(
  supabase: MobileSupabase | null,
): Promise<MyProfile> {
  const empty: MyProfile = { attendee: null, memberships: [], checkIns: [] };
  if (!supabase) return empty;

  const [memberships, attendee] = await Promise.all([
    getMyMemberships(supabase),
    getMyAttendee(supabase),
  ]);
  if (!attendee) return { ...empty, memberships };

  const { data, error } = await supabase.client
    .from("attendance")
    .select("org_id, meeting:meetings(start_time, title)")
    .eq("attendee_id", attendee.id);
  if (error) throw new DataError("getMyProfile", error);

  const checkIns = (data ?? []).flatMap((row) =>
    row.meeting?.start_time
      ? [{ orgId: row.org_id, startTime: row.meeting.start_time, title: row.meeting.title }]
      : [],
  );
  return { attendee, memberships, checkIns };
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

export async function getMyOrgMeetings(
  supabase: MobileSupabase | null,
  orgId: string,
  window: { start: string; end: string },
): Promise<{ meetings: OrgMeeting[]; total: number }> {
  if (!supabase) return { meetings: [], total: 0 };
  const attendee = await getMyAttendee(supabase);
  if (!attendee) return { meetings: [], total: 0 };

  const { data, error } = await supabase.client.rpc("get_member_meetings_page", {
    p_org_id: orgId,
    p_attendee_id: attendee.id,
    p_start: window.start,
    p_end: window.end,
    p_view: "all",
    p_limit: 100,
    p_offset: 0,
  });
  if (error) throw new DataError("getMyOrgMeetings", error);

  const rows = data ?? [];
  return {
    meetings: rows.map((row) => ({
      id: row.id,
      title: row.title,
      startTime: row.start_time,
      attended: row.attended,
      description: row.description || null,
      questions: meetingQuestions(row.form_schema),
    })),
    // total_count is the same on every row; 0 when there are none.
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
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

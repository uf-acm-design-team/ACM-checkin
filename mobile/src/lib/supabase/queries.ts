import type { PostgrestError, QueryData } from "@supabase/supabase-js";
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

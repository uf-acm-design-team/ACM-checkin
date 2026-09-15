// Shared org membership roster, used by both admin-dashboard/page.tsx (the
// "Total Members" tile) and admin-dashboard/members-tab.tsx (the officer
// roster table). Mirrors the pure/IO split in lib/stats-terms.ts /
// lib/stats-data.ts: buildOrgMemberRoster is pure and unit-tested,
// fetchOrgMembers does the actual Supabase round trips.
//
// Why this exists: memberships.user_id is a Clerk id (TEXT NOT NULL), so a
// memberships row can never represent a guest who checked in without an
// account. The old query here started and ended at `memberships`, which made
// every guest -- no matter how many meetings they'd attended -- invisible to
// officers. This computes membership live from attendees + attendance
// instead (which already support guests via a nullable user_id), using the
// same resolveMembership() logic the individual stats page trusts, so a
// guest shows up the moment they clear the org's baseline and needs no
// separate row or sync step once they eventually sign up.
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveMembership } from "@/lib/membership";

export type MemberStatus = "pending" | "active";

export interface OrgMember {
  attendee_id: string;
  user_id: string | null; // Clerk id; null = guest, no account
  authenticated: boolean; // user_id !== null
  role: string | null; // memberships.role; null = no explicit row
  status: MemberStatus;
  first_name: string;
  last_name: string;
  email: string;
  grad_year: string;
  attendance_count: number;
}

type AttendeeRow = {
  id: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  grad_year: string | null;
};

type MembershipRow = { user_id: string; role: string; status: string | null };

/**
 * Pure merge: attendees with >=1 attendance in this org, unioned with every
 * memberships row for the org (an officer appointed the day the org was
 * created has zero check-ins but must still show up -- invite_org_member
 * always inserts status: 'active', so resolveMembership already treats them
 * as a member; they just have to actually be looked at).
 *
 * Baseline: a row is dropped entirely unless attendance_count >= 1 OR it has
 * a role. Zero attendance and no role means no membership at all, not even
 * "pending".
 */
export function buildOrgMemberRoster(
  attendees: AttendeeRow[],
  countsByAttendee: Record<string, number>,
  memberships: MembershipRow[],
  orgSlug: string,
): OrgMember[] {
  const membershipByUserId = new Map(memberships.map((m) => [m.user_id, m]));
  const seenUserIds = new Set<string>();

  const rows: OrgMember[] = [];

  for (const a of attendees) {
    if (a.user_id) seenUserIds.add(a.user_id);
    const membership = a.user_id ? membershipByUserId.get(a.user_id) : undefined;
    const attendanceCount = countsByAttendee[a.id] ?? 0;
    const role = membership?.role ?? null;

    if (attendanceCount < 1 && role === null) continue;

    const { isMember } = resolveMembership(
      role,
      membership?.status ?? null,
      attendanceCount,
      orgSlug,
    );

    rows.push({
      attendee_id: a.id,
      user_id: a.user_id,
      authenticated: a.user_id !== null,
      role,
      status: isMember ? "active" : "pending",
      first_name: a.first_name ?? "Unknown",
      last_name: a.last_name ?? "",
      email: a.email ?? "—",
      grad_year: a.grad_year ?? "",
      attendance_count: attendanceCount,
    });
  }

  // A memberships row whose user_id has no matching attendees row at all.
  // Shouldn't happen in practice (invite_org_member requires
  // attendees.user_id IS NOT NULL, and nothing deletes an attendees row),
  // but memberships has no FK to attendees -- fall back to a placeholder
  // rather than silently dropping a real role-holder from the roster.
  for (const m of memberships) {
    if (seenUserIds.has(m.user_id)) continue;
    const { isMember } = resolveMembership(m.role, m.status, 0, orgSlug);
    rows.push({
      attendee_id: `orphan:${m.user_id}`,
      user_id: m.user_id,
      authenticated: true,
      role: m.role,
      status: isMember ? "active" : "pending",
      first_name: "Unknown",
      last_name: "",
      email: "—",
      grad_year: "",
      attendance_count: 0,
    });
  }

  return rows.sort(compareMembers);
}

// Officer -> signed in -> everyone else. "Officer" here matches the Overview
// tab's existing Officers-panel meaning (a role above plain 'member'), not
// just "has any memberships row" -- an explicitly invited plain member sorts
// into the "signed in" tier alongside everyone else who has an account but
// no elevated role. Within a tier, alphabetical by name for a stable order.
function memberTier(m: OrgMember): number {
  if (m.role && m.role.toLowerCase() !== "member") return 0; // officer/co-owner/owner
  if (m.authenticated) return 1; // signed in -- plain member role or none
  return 2; // guest
}

function compareMembers(a: OrgMember, b: OrgMember): number {
  const tierDiff = memberTier(a) - memberTier(b);
  if (tierDiff !== 0) return tierDiff;
  const nameA = `${a.last_name} ${a.first_name}`.trim().toLowerCase();
  const nameB = `${b.last_name} ${b.first_name}`.trim().toLowerCase();
  return nameA.localeCompare(nameB);
}

export async function fetchOrgMembers(
  supabase: SupabaseClient,
  orgId: string,
  orgSlug: string,
): Promise<OrgMember[]> {
  const [{ data: attendanceRows, error: attErr }, { data: memberships, error: memErr }] =
    await Promise.all([
      supabase.from("attendance").select("attendee_id").eq("org_id", orgId),
      supabase.from("memberships").select("user_id, role, status").eq("org_id", orgId),
    ]);
  if (attErr) console.error("Error fetching org attendance:", attErr);
  if (memErr) console.error("Error fetching org memberships:", memErr);

  const countsByAttendee: Record<string, number> = {};
  for (const row of attendanceRows ?? []) {
    countsByAttendee[row.attendee_id] = (countsByAttendee[row.attendee_id] ?? 0) + 1;
  }
  const attendeeIds = Object.keys(countsByAttendee);
  const membershipRows = (memberships ?? []) as MembershipRow[];
  const membershipUserIds = membershipRows.map((m) => m.user_id).filter(Boolean);

  if (attendeeIds.length === 0 && membershipUserIds.length === 0) return [];

  const [{ data: byAttendance, error: aErr }, { data: byMembership, error: bErr }] =
    await Promise.all([
      attendeeIds.length
        ? supabase
            .from("attendees")
            .select("id, user_id, first_name, last_name, email, grad_year")
            .in("id", attendeeIds)
        : Promise.resolve({ data: [] as AttendeeRow[], error: null }),
      membershipUserIds.length
        ? supabase
            .from("attendees")
            .select("id, user_id, first_name, last_name, email, grad_year")
            .in("user_id", membershipUserIds)
        : Promise.resolve({ data: [] as AttendeeRow[], error: null }),
    ]);
  if (aErr) console.error("Error fetching attendees (attendance-linked):", aErr);
  if (bErr) console.error("Error fetching attendees (membership-linked):", bErr);

  const attendeesById = new Map<string, AttendeeRow>();
  for (const a of [...((byAttendance ?? []) as AttendeeRow[]), ...((byMembership ?? []) as AttendeeRow[])]) {
    attendeesById.set(a.id, a);
  }

  return buildOrgMemberRoster(
    [...attendeesById.values()],
    countsByAttendee,
    membershipRows,
    orgSlug,
  );
}

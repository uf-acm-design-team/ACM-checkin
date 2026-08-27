// Org role hierarchy and the client-side mirror of the permission matrix.
//
// THE SERVER IS THE SOURCE OF TRUTH. Every rule here is re-enforced by the
// SECURITY DEFINER RPCs in supabase/migrations -- this module exists so the UI
// can hide controls that would fail, never to decide whether an action is
// allowed. Keep it in sync with:
//
//   _appointment_ceiling / invite_org_member / set_member_role
//     -> 20260826000200_admin_only_officer_appointment.sql
//   remove_org_member
//     -> 20260824000000_member_management_and_coowner.sql
//   set_member_role's admin-only owner branch
//     -> 20260825000000_admin_demote_owner.sql
//
// Pure and I/O-free so it can be unit tested (lib/org-roles.test.ts).

export const ROLE_LEVEL: Record<string, number> = {
  member: 0,
  officer: 1,
  "co-owner": 2,
  owner: 3,
};

export const ROLE_LABEL: Record<string, string> = {
  member: "Member",
  officer: "Officer",
  "co-owner": "Co-owner",
  owner: "Owner",
};

// Roles that can be assigned directly. 'owner' is absent by design: ownership
// moves only through transfer_org_ownership, which keeps the single-owner
// index and the succession audit entry intact.
export const ROLE_ORDER = ["member", "officer", "co-owner"] as const;

// One tier at a time -- a single Promote/Demote button per row rather than a
// button per reachable target role.
export const NEXT_ROLE_UP: Record<string, string | undefined> = {
  member: "officer",
  officer: "co-owner",
};
export const NEXT_ROLE_DOWN: Record<string, string | undefined> = {
  "co-owner": "officer",
  officer: "member",
};

/**
 * The caller's authority level, with a global admin treated as 'owner'.
 *
 * Mirrors _effective_org_role(). Used for DEMOTION and REMOVAL, which still
 * follow the caller's rank.
 */
export function callerLevel(
  membershipRole: string | null,
  isGlobalAdmin: boolean,
): number {
  if (isGlobalAdmin) return ROLE_LEVEL.owner;
  return ROLE_LEVEL[membershipRole ?? ""] ?? -1;
}

/**
 * The highest role level the caller may appoint someone else INTO.
 *
 * Mirrors _appointment_ceiling(). Granting authority is a platform-level act
 * and deliberately does NOT follow the caller's own rank the way demotion
 * does:
 *
 *   global admin       -> up to co-owner
 *   owner              -> up to officer
 *   officer / co-owner -> plain members only
 *
 * Returning -1 means the caller may not add anyone at all.
 */
export function appointmentCeiling(
  membershipRole: string | null,
  isGlobalAdmin: boolean,
): number {
  if (isGlobalAdmin) return ROLE_LEVEL["co-owner"];
  if (membershipRole === "owner") return ROLE_LEVEL.officer;
  if (membershipRole === "officer" || membershipRole === "co-owner") {
    return ROLE_LEVEL.member;
  }
  return -1;
}

/**
 * The role a Promote button should target, or null to hide it.
 *
 * Gated on the appointment ceiling, NOT the caller's rank -- an officer can no
 * longer promote a member to officer.
 */
export function promoteTarget(
  targetRole: string,
  ceiling: number,
): string | null {
  const next = NEXT_ROLE_UP[targetRole];
  if (!next) return null;
  return ROLE_LEVEL[next] <= ceiling ? next : null;
}

/**
 * The role a Demote button should target, or null to hide it.
 *
 * Unchanged by the appointment restriction: a club can always strip authority
 * locally, it just cannot grant it. Demoting an owner is admin-only.
 */
export function demoteTarget(
  targetRole: string,
  level: number,
  isGlobalAdmin: boolean,
): string | null {
  if (targetRole === "owner") return isGlobalAdmin ? "co-owner" : null;
  const next = NEXT_ROLE_DOWN[targetRole];
  if (!next) return null;
  return level >= 2 ? next : null;
}

/** Mirrors remove_org_member's branches exactly. */
export function canRemove(
  targetRole: string,
  level: number,
  isGlobalAdmin: boolean,
): boolean {
  if (targetRole === "owner") return isGlobalAdmin;
  if (targetRole === "co-owner" || targetRole === "officer") return level >= 2;
  return level >= 1;
}

/**
 * How to name the caller within one org.
 *
 * A global admin who also holds a real membership row is shown as that club
 * role -- they are a genuine officer of this club, not a visiting platform
 * admin -- with admin status carried as a separate marker. Purely cosmetic:
 * their platform authority is identical either way.
 */
export function roleBadgeLabel(
  membershipRole: string | null,
  isGlobalAdmin: boolean,
): string | null {
  const clubRole =
    membershipRole && membershipRole !== "admin" ? membershipRole : null;
  if (clubRole) {
    const label =
      ROLE_LABEL[clubRole] ??
      clubRole.charAt(0).toUpperCase() + clubRole.slice(1);
    return isGlobalAdmin ? `${label} · Global admin` : label;
  }
  return isGlobalAdmin ? "Global admin" : null;
}

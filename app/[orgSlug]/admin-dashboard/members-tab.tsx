"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "../../utils/supabase/client";

// Role hierarchy for the confirmed permission matrix (see
// supabase/migrations/20260824000000_member_management_and_coowner.sql for
// the server-side source of truth -- this file only mirrors it for UX, every
// rule here is re-enforced by the RPCs regardless of what renders).
const ROLE_LEVEL: Record<string, number> = {
  member: 0,
  officer: 1,
  "co-owner": 2,
  owner: 3,
};
const ROLE_LABEL: Record<string, string> = {
  member: "Member",
  officer: "Officer",
  "co-owner": "Co-owner",
  owner: "Owner",
};
const ROLE_ORDER = ["member", "officer", "co-owner"] as const;

// One tier at a time -- a single Promote/Demote button per row rather than a
// button per reachable target role.
const NEXT_ROLE_UP: Record<string, string | undefined> = {
  member: "officer",
  officer: "co-owner",
};
const NEXT_ROLE_DOWN: Record<string, string | undefined> = {
  "co-owner": "officer",
  officer: "member",
};

function callerLevel(membershipRole: string | null, isGlobalAdmin: boolean) {
  if (isGlobalAdmin) return ROLE_LEVEL.owner;
  return ROLE_LEVEL[membershipRole ?? ""] ?? -1;
}

// Mirrors set_member_role's promotion ceiling: officers can promote up to
// officer only; co-owner/owner up to co-owner.
function promoteTarget(targetRole: string, level: number): string | null {
  const next = NEXT_ROLE_UP[targetRole];
  if (!next) return null;
  return level >= 1 && ROLE_LEVEL[next] <= level ? next : null;
}

// Mirrors set_member_role's demotion rule: co-owner/owner only, except
// demoting an owner is admin-only (20260825000000_admin_demote_owner.sql).
function demoteTarget(
  targetRole: string,
  level: number,
  isGlobalAdmin: boolean,
): string | null {
  if (targetRole === "owner") return isGlobalAdmin ? "co-owner" : null;
  const next = NEXT_ROLE_DOWN[targetRole];
  if (!next) return null;
  return level >= 2 ? next : null;
}

// Mirrors remove_org_member's branches exactly.
function canRemove(targetRole: string, level: number, isGlobalAdmin: boolean) {
  if (targetRole === "owner") return isGlobalAdmin;
  if (targetRole === "co-owner" || targetRole === "officer") return level >= 2;
  return level >= 1;
}

interface Member {
  user_id: string;
  role: string;
  first_name: string;
  last_name: string;
  email: string;
  grad_year: string;
  attendance_count: number;
}

interface MeetingOption {
  id: string;
  title: string;
  start_time: string;
}

interface MembersTabProps {
  orgId: string;
  membershipRole: string | null;
  isGlobalAdmin: boolean;
  meetings: MeetingOption[];
}

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function MembersTab({
  orgId,
  membershipRole,
  isGlobalAdmin,
  meetings,
}: MembersTabProps) {
  const supabase = createClient();
  const level = callerLevel(membershipRole, isGlobalAdmin);

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [memberSearch, setMemberSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [checkinTargetUserId, setCheckinTargetUserId] = useState<string | null>(null);
  const [checkinMeetingId, setCheckinMeetingId] = useState("");
  const [checkinSubmitting, setCheckinSubmitting] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetUserId, setTransferTargetUserId] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const { data: memberships, error } = await supabase
        .from("memberships")
        .select("user_id, role")
        .eq("org_id", orgId);

      if (error) {
        console.error("Error fetching memberships:", error);
        return;
      }

      const userIds = (memberships || []).map((m) => m.user_id).filter(Boolean);
      let attendeesById: Record<
        string,
        { id: string; first_name: string; last_name: string; email: string; grad_year: string }
      > = {};
      const countsByAttendee: Record<string, number> = {};

      if (userIds.length > 0) {
        const { data: attendees } = await supabase
          .from("attendees")
          .select("id, user_id, first_name, last_name, email, grad_year")
          .in("user_id", userIds);

        attendeesById = Object.fromEntries(
          (attendees || []).map((a) => [a.user_id, a]),
        );

        const attendeeIds = (attendees || []).map((a) => a.id);
        if (attendeeIds.length > 0) {
          const { data: attendanceRows } = await supabase
            .from("attendance")
            .select("attendee_id")
            .eq("org_id", orgId)
            .in("attendee_id", attendeeIds);

          for (const row of attendanceRows || []) {
            countsByAttendee[row.attendee_id] =
              (countsByAttendee[row.attendee_id] || 0) + 1;
          }
        }
      }

      setMembers(
        (memberships || []).map((m) => {
          const attendee = attendeesById[m.user_id];
          return {
            user_id: m.user_id,
            role: m.role,
            first_name: attendee?.first_name ?? "Unknown",
            last_name: attendee?.last_name ?? "",
            email: attendee?.email ?? "—",
            grad_year: attendee?.grad_year ?? "",
            attendance_count: attendee ? countsByAttendee[attendee.id] || 0 : 0,
          };
        }),
      );
    } finally {
      setMembersLoading(false);
    }
  }, [orgId, supabase]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const search = memberSearch.trim().toLowerCase();
  const filteredMembers = members.filter(
    (m) =>
      !search ||
      `${m.first_name} ${m.last_name}`.toLowerCase().includes(search) ||
      m.email.toLowerCase().includes(search) ||
      m.role?.toLowerCase().includes(search),
  );

  const invitableRoles = useMemo(
    () => ROLE_ORDER.filter((role) => ROLE_LEVEL[role] <= level),
    [level],
  );

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);
    try {
      const { error } = await supabase.rpc("invite_org_member", {
        p_org_id: orgId,
        p_email: inviteEmail.trim(),
        p_role: inviteRole,
      });
      if (error) {
        setInviteError(error.message);
        return;
      }
      setShowInviteModal(false);
      setInviteEmail("");
      setInviteRole("member");
      fetchMembers();
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: string) => {
    setActionError(null);
    setBusyUserId(targetUserId);
    try {
      const { error } = await supabase.rpc("set_member_role", {
        p_org_id: orgId,
        p_target_user_id: targetUserId,
        p_new_role: newRole,
      });
      if (error) {
        setActionError(error.message);
        return;
      }
      fetchMembers();
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRemove = async (member: Member) => {
    if (
      !confirm(
        `Remove ${member.first_name} ${member.last_name} from the organization?`,
      )
    )
      return;
    setActionError(null);
    setBusyUserId(member.user_id);
    try {
      const { error } = await supabase.rpc("remove_org_member", {
        p_org_id: orgId,
        p_target_user_id: member.user_id,
      });
      if (error) {
        setActionError(error.message);
        return;
      }
      fetchMembers();
    } finally {
      setBusyUserId(null);
    }
  };

  const transferCandidates = useMemo(
    () => members.filter((m) => m.role === "co-owner" || m.role === "officer"),
    [members],
  );

  // A real owner always sees this. A global admin only sees it when the org
  // currently has no owner (the recovery path after an admin-forced
  // removal) -- otherwise it'd show for admins visiting orgs they don't
  // actually own, which isn't what "transfer ownership" means for them.
  const hasOwner = members.some((m) => m.role === "owner");
  const canShowTransfer =
    !membersLoading && (membershipRole === "owner" || (isGlobalAdmin && !hasOwner));

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTargetUserId) return;
    setTransferring(true);
    setTransferError(null);
    try {
      const { error } = await supabase.rpc("transfer_org_ownership", {
        p_org_id: orgId,
        p_new_owner_user_id: transferTargetUserId,
      });
      if (error) {
        setTransferError(error.message);
        return;
      }
      setShowTransferModal(false);
      setTransferTargetUserId("");
      fetchMembers();
    } finally {
      setTransferring(false);
    }
  };

  const openCheckinModal = (targetUserId: string) => {
    setCheckinTargetUserId(targetUserId);
    setCheckinMeetingId(meetings[0]?.id ?? "");
    setCheckinError(null);
  };

  const handleManualCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkinTargetUserId || !checkinMeetingId) return;
    setCheckinSubmitting(true);
    setCheckinError(null);
    try {
      const { error } = await supabase.rpc("officer_manual_checkin", {
        p_meeting_id: checkinMeetingId,
        p_target_user_id: checkinTargetUserId,
      });
      if (error) {
        setCheckinError(error.message);
        return;
      }
      setCheckinTargetUserId(null);
    } finally {
      setCheckinSubmitting(false);
    }
  };

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <input
          type="text"
          placeholder="Search members..."
          value={memberSearch}
          onChange={(e) => setMemberSearch(e.target.value)}
          className="w-full rounded-[9px] border border-slate-200 bg-white px-4 py-2.5 text-sm sm:w-auto sm:min-w-65"
        />
        <div className="flex items-center gap-3">
          <div className="text-[13px] font-semibold text-slate-500">
            {members.length} member{members.length === 1 ? "" : "s"}
          </div>
          {canShowTransfer && (
            <button
              onClick={() => {
                setTransferError(null);
                setTransferTargetUserId("");
                setShowTransferModal(true);
              }}
              className="cursor-pointer rounded-[9px] border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-brand-background transition-all hover:bg-slate-50"
            >
              Transfer ownership
            </button>
          )}
          {level >= 1 && (
            <button
              onClick={() => {
                setInviteError(null);
                setShowInviteModal(true);
              }}
              className="cursor-pointer rounded-[9px] bg-brand-action px-4 py-2 text-sm font-bold text-white transition-all hover:opacity-90"
            >
              + Invite by email
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
        <div className="hidden grid-cols-[1.6fr_1.8fr_1fr_1fr_1.6fr] gap-4 border-b border-slate-200 px-5 py-3.5 text-xs font-bold tracking-wide text-slate-500 uppercase md:grid">
          <div>Name</div>
          <div>Contact</div>
          <div>Role</div>
          <div>Check-Ins</div>
          <div className="text-right">Actions</div>
        </div>
        {membersLoading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Loading members...
          </div>
        ) : filteredMembers.length > 0 ? (
          filteredMembers.map((mem) => {
            const promoteRole = promoteTarget(mem.role, level);
            const demoteRole = demoteTarget(mem.role, level, isGlobalAdmin);
            const removable = canRemove(mem.role, level, isGlobalAdmin);
            const busy = busyUserId === mem.user_id;

            return (
              <div
                key={mem.user_id}
                className="flex flex-col gap-2.5 border-b border-slate-100 px-4 py-3.5 text-sm last:border-b-0 sm:px-5 md:grid md:grid-cols-[1.6fr_1.8fr_1fr_1fr_1.6fr] md:items-center md:gap-4"
              >
                <div className="flex min-w-0 items-center gap-2.5 font-bold">
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-primary/10 text-[11px] font-bold text-brand-primary">
                    {initials(`${mem.first_name} ${mem.last_name}`)}
                  </div>
                  <span className="min-w-0 wrap-break-word">
                    {mem.first_name} {mem.last_name}
                  </span>
                </div>
                <div className="text-[13px] font-medium break-all text-slate-600 md:truncate md:break-normal">
                  {mem.email}
                </div>
                <div>
                  <span className="inline-block rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 capitalize">
                    {ROLE_LABEL[mem.role] ?? mem.role}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold">{mem.attendance_count}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 md:justify-end">
                  {level >= 1 && meetings.length > 0 && (
                    <button
                      onClick={() => openCheckinModal(mem.user_id)}
                      className="cursor-pointer rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
                    >
                      Add to meeting
                    </button>
                  )}
                  {promoteRole && (
                    <button
                      disabled={busy}
                      onClick={() => handleRoleChange(mem.user_id, promoteRole)}
                      className="cursor-pointer rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Promote
                    </button>
                  )}
                  {demoteRole && (
                    <button
                      disabled={busy}
                      onClick={() => handleRoleChange(mem.user_id, demoteRole)}
                      className="cursor-pointer rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Demote
                    </button>
                  )}
                  {removable && (
                    <button
                      disabled={busy}
                      onClick={() => handleRemove(mem)}
                      className="cursor-pointer rounded-md border border-red-200 px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-10 text-center text-sm text-slate-500">
            No members match your search.
          </div>
        )}
      </div>

      {/* INVITE MODAL */}
      {showInviteModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-4"
          onClick={() => setShowInviteModal(false)}
        >
          <form
            onSubmit={handleInvite}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:w-100 sm:max-w-[92vw] sm:rounded-2xl sm:p-7"
          >
            <div className="mb-1 text-lg font-extrabold">Invite by email</div>
            <p className="mb-4 text-xs text-slate-500">
              The email must already belong to a registered account -- they need
              to have signed in at least once.
            </p>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="member@ufl.edu"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm capitalize"
                >
                  {invitableRoles.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
              </div>
              {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="cursor-pointer rounded-[9px] border border-slate-200 bg-white px-4.5 py-2.5 text-[13px] font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={inviting}
                className="cursor-pointer rounded-[9px] bg-brand-action px-4.5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {inviting ? "Inviting..." : "Invite"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TRANSFER OWNERSHIP MODAL */}
      {showTransferModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-4"
          onClick={() => setShowTransferModal(false)}
        >
          <form
            onSubmit={handleTransfer}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:w-100 sm:max-w-[92vw] sm:rounded-2xl sm:p-7"
          >
            <div className="mb-1 text-lg font-extrabold">Transfer ownership</div>
            <p className="mb-4 text-xs text-slate-500">
              You&apos;ll step down to co-owner. The person you pick must already
              be a co-owner or officer.
            </p>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">
                  New owner
                </label>
                <select
                  required
                  value={transferTargetUserId}
                  onChange={(e) => setTransferTargetUserId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                >
                  <option value="" disabled>
                    Select a member
                  </option>
                  {transferCandidates.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.first_name} {m.last_name} ({ROLE_LABEL[m.role]})
                    </option>
                  ))}
                </select>
                {transferCandidates.length === 0 && (
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    No eligible co-owners or officers yet -- promote someone
                    first.
                  </p>
                )}
              </div>
              {transferError && <p className="text-sm text-red-600">{transferError}</p>}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="cursor-pointer rounded-[9px] border border-slate-200 bg-white px-4.5 py-2.5 text-[13px] font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={transferring || !transferTargetUserId}
                className="cursor-pointer rounded-[9px] bg-brand-action px-4.5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {transferring ? "Transferring..." : "Transfer"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MANUAL CHECK-IN MODAL */}
      {checkinTargetUserId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-4"
          onClick={() => setCheckinTargetUserId(null)}
        >
          <form
            onSubmit={handleManualCheckin}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:w-100 sm:max-w-[92vw] sm:rounded-2xl sm:p-7"
          >
            <div className="mb-1 text-lg font-extrabold">Add to meeting</div>
            <p className="mb-4 text-xs text-slate-500">
              Marks this member as checked in without them going through the
              check-in flow. No form answers are recorded and location is not
              checked.
            </p>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">
                  Meeting
                </label>
                <select
                  value={checkinMeetingId}
                  onChange={(e) => setCheckinMeetingId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                >
                  {meetings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} — {new Date(m.start_time).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
              {checkinError && <p className="text-sm text-red-600">{checkinError}</p>}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCheckinTargetUserId(null)}
                className="cursor-pointer rounded-[9px] border border-slate-200 bg-white px-4.5 py-2.5 text-[13px] font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={checkinSubmitting}
                className="cursor-pointer rounded-[9px] bg-brand-action px-4.5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {checkinSubmitting ? "Saving..." : "Mark checked in"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

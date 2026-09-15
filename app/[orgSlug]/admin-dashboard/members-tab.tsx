"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "../../utils/supabase/client";
import { Check } from "lucide-react";
// Permission matrix mirror -- pure, unit-tested, and documented against the
// RPCs that actually enforce these rules. See lib/org-roles.ts.
import {
  ROLE_LEVEL,
  ROLE_LABEL,
  ROLE_ORDER,
  appointmentCeiling,
  callerLevel,
  canRemove,
  demoteTarget,
  promoteTarget,
} from "@/lib/org-roles";
import { fetchOrgMembers, type OrgMember } from "@/lib/org-members";

type Member = OrgMember;

const MEMBERS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

interface MeetingOption {
  id: string;
  title: string;
  start_time: string;
}

interface MembersTabProps {
  orgId: string;
  orgSlug: string;
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
  orgSlug,
  membershipRole,
  isGlobalAdmin,
  meetings,
}: MembersTabProps) {
  const supabase = createClient();
  const level = callerLevel(membershipRole, isGlobalAdmin);
  // What the caller may GRANT, which is now narrower than what they hold.
  const ceiling = appointmentCeiling(membershipRole, isGlobalAdmin);

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [memberSearch, setMemberSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // Rendering cap only -- the full roster is fetched once; this just limits
  // how much of it is shown at a time. Officer-selectable, not tied to the
  // fetch itself.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const openInviteModal = (prefill?: { email: string; role?: string }) => {
    setInviteError(null);
    setInviteEmail(prefill?.email ?? "");
    setInviteRole(prefill?.role ?? "member");
    setShowInviteModal(true);
  };

  const [checkinTargetUserId, setCheckinTargetUserId] = useState<string | null>(
    null,
  );
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
      setMembers(await fetchOrgMembers(supabase, orgId, orgSlug));
    } finally {
      setMembersLoading(false);
    }
  }, [orgId, orgSlug, supabase]);

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

  // A new search or page-size change should never leave the view scrolled
  // past what's now the filtered/sized result set.
  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  const pagedMembers = filteredMembers.slice(0, page * pageSize);
  const canLoadMoreMembers = filteredMembers.length > pagedMembers.length;

  const invitableRoles = useMemo(
    () => ROLE_ORDER.filter((role) => ROLE_LEVEL[role] <= ceiling),
    [ceiling],
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

  // Only ever called from a row with a real memberships row (the "Remove"
  // button is gated on that), which guarantees user_id is set -- role !== null
  // is only possible via a matched or orphaned memberships row, both of which
  // carry a real Clerk id.
  const handleRemove = async (member: Member) => {
    if (!member.user_id) return;
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
    !membersLoading &&
    (membershipRole === "owner" || (isGlobalAdmin && !hasOwner));

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <input
            type="text"
            placeholder="Search members..."
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            className="w-full rounded-control border border-line bg-white px-4 py-2.5 text-sm sm:w-auto sm:min-w-65"
          />
          <label className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted">
            Per page
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-control border border-line bg-white px-2 py-1.5 text-[13px] font-semibold"
            >
              {MEMBERS_PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[13px] font-semibold text-ink-muted">
            {members.length} member{members.length === 1 ? "" : "s"}
          </div>
          {canShowTransfer && (
            <button
              onClick={() => {
                setTransferError(null);
                setTransferTargetUserId("");
                setShowTransferModal(true);
              }}
              className="cursor-pointer rounded-control border border-line bg-white px-4 py-2 text-sm font-bold text-ink-strong transition-all hover:bg-canvas"
            >
              Transfer ownership
            </button>
          )}
          {ceiling >= 0 && (
            <button
              onClick={() => openInviteModal()}
              className="cursor-pointer rounded-control bg-accent px-4 py-2 text-sm font-bold text-accent-ink transition-colors hover:bg-accent-deep"
            >
              + Add by email
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-bad-line bg-bad-surface px-4 py-3 text-sm text-bad-ink">
          {actionError}
        </div>
      )}

      <div className="overflow-hidden rounded-card border border-line bg-white">
        <div className="hidden grid-cols-[1.6fr_1.8fr_1fr_1fr_1fr_1.6fr] gap-4 border-b border-line px-5 py-3.5 text-xs font-bold tracking-wide text-ink-muted uppercase md:grid">
          <div>Name</div>
          <div>Contact</div>
          <div>Role</div>
          <div>Status</div>
          <div>Check-Ins</div>
          <div className="text-right">Actions</div>
        </div>
        {membersLoading ? (
          <div className="p-10 text-center text-sm text-ink-muted">
            Loading members...
          </div>
        ) : pagedMembers.length > 0 ? (
          pagedMembers.map((mem) => {
            // Three states, driven by authenticated/role independently of the
            // pending/active status badge:
            //   1. Guest, no account          -- no actions at all.
            //   2. Account, no memberships row -- Add to meeting + Invite.
            //   3. Real memberships row        -- promote/demote/remove.
            // role !== null is only possible via a matched or orphaned
            // memberships row, both of which carry a real Clerk user_id --
            // safe to assert non-null wherever gated on mem.role or
            // mem.authenticated below.
            const promoteRole = mem.role ? promoteTarget(mem.role, ceiling) : null;
            const demoteRole = mem.role
              ? demoteTarget(mem.role, level, isGlobalAdmin)
              : null;
            const removable = mem.role
              ? canRemove(mem.role, level, isGlobalAdmin)
              : false;
            const busy = busyUserId === mem.user_id;

            return (
              <div
                key={mem.attendee_id}
                className="flex flex-col gap-2.5 border-b border-line-soft px-4 py-3.5 text-sm last:border-b-0 sm:px-5 md:grid md:grid-cols-[1.6fr_1.8fr_1fr_1fr_1fr_1.6fr] md:items-center md:gap-4"
              >
                <div className="flex min-w-0 items-center gap-2.5 font-bold">
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
                    {initials(`${mem.first_name} ${mem.last_name}`)}
                  </div>
                  <span className="min-w-0 wrap-break-word">
                    {mem.first_name} {mem.last_name}
                  </span>
                  {mem.authenticated && (
                    <span title="Registered" className="flex-none">
                      <Check className="h-3.5 w-3.5 text-good-ink" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div className="text-[13px] font-medium break-all text-ink-strong md:truncate md:break-normal">
                  {mem.email}
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className="inline-block rounded-full bg-surface-sunken px-2.5 py-1 text-[11px] font-bold text-ink-strong capitalize">
                    {mem.role ? (ROLE_LABEL[mem.role] ?? mem.role) : "Member"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <span
                    className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${
                      mem.status === "active"
                        ? "bg-good-surface text-good-ink"
                        : "bg-warn-surface text-warn-ink"
                    }`}
                  >
                    {mem.status}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold">
                    {mem.attendance_count}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 md:justify-end">
                  {mem.authenticated && level >= 1 && meetings.length > 0 && (
                    <button
                      onClick={() => openCheckinModal(mem.user_id!)}
                      className="cursor-pointer rounded-md border border-line px-2 py-1 text-[11px] font-bold text-ink-strong hover:bg-surface-sunken"
                    >
                      Add to meeting
                    </button>
                  )}
                  {mem.authenticated && mem.role === null && ceiling >= 0 && (
                    <button
                      onClick={() =>
                        openInviteModal({ email: mem.email, role: "member" })
                      }
                      className="cursor-pointer rounded-md border border-line px-2 py-1 text-[11px] font-bold text-ink-strong hover:bg-surface-sunken"
                    >
                      Invite
                    </button>
                  )}
                  {promoteRole && (
                    <button
                      disabled={busy}
                      onClick={() => handleRoleChange(mem.user_id!, promoteRole)}
                      className="cursor-pointer rounded-md border border-line px-2 py-1 text-[11px] font-bold text-ink-strong hover:bg-surface-sunken disabled:opacity-50"
                    >
                      Promote
                    </button>
                  )}
                  {demoteRole && (
                    <button
                      disabled={busy}
                      onClick={() => handleRoleChange(mem.user_id!, demoteRole)}
                      className="cursor-pointer rounded-md border border-line px-2 py-1 text-[11px] font-bold text-ink-strong hover:bg-surface-sunken disabled:opacity-50"
                    >
                      Demote
                    </button>
                  )}
                  {removable && (
                    <button
                      disabled={busy}
                      onClick={() => handleRemove(mem)}
                      className="cursor-pointer rounded-md border border-bad-line px-2 py-1 text-[11px] font-bold text-bad hover:bg-bad-surface disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-10 text-center text-sm text-ink-muted">
            No members match your search.
          </div>
        )}
        {canLoadMoreMembers && (
          <div className="border-t border-line-soft p-4 text-center">
            <button
              onClick={() => setPage((p) => p + 1)}
              className="cursor-pointer rounded-control border border-line bg-white px-4 py-2 text-[13px] font-bold text-ink-strong hover:bg-canvas"
            >
              Load more
            </button>
          </div>
        )}
      </div>

      {/* INVITE MODAL */}
      {showInviteModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 sm:items-center sm:p-4"
          onClick={() => setShowInviteModal(false)}
        >
          <form
            onSubmit={handleInvite}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:w-100 sm:max-w-[92vw] sm:rounded-2xl sm:p-7"
          >
            <div className="mb-1 text-lg font-extrabold">Invite by email</div>
            <p className="mb-4 text-xs text-ink-muted">
              The email must already belong to a registered account -- they need
              to have signed in at least once.
            </p>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-muted">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="member@ufl.edu"
                  className="w-full rounded-lg border border-line px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-muted">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full rounded-lg border border-line px-3 py-2.5 text-sm capitalize"
                >
                  {invitableRoles.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
                {/* Say why the higher roles are absent. Without this the
                    select just silently lacks them and reads as a bug. */}
                {ceiling < ROLE_LEVEL["co-owner"] && (
                  <p className="mt-1.5 text-[11px] text-ink-muted">
                    {ceiling < ROLE_LEVEL.officer
                      ? "Only the owner can appoint officers, and only a global admin can appoint co-owners."
                      : "Only a global admin can appoint co-owners."}
                  </p>
                )}
              </div>
              {inviteError && <p className="text-sm text-bad">{inviteError}</p>}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="cursor-pointer rounded-control border border-line bg-white px-4 py-2.5 text-[13px] font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={inviting}
                className="cursor-pointer rounded-control bg-accent px-4 py-2.5 text-[13px] font-bold text-accent-ink disabled:opacity-50"
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 sm:items-center sm:p-4"
          onClick={() => setShowTransferModal(false)}
        >
          <form
            onSubmit={handleTransfer}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:w-100 sm:max-w-[92vw] sm:rounded-2xl sm:p-7"
          >
            <div className="mb-1 text-lg font-extrabold">
              Transfer ownership
            </div>
            <p className="mb-4 text-xs text-ink-muted">
              You&apos;ll step down to co-owner. The person you pick must
              already be a co-owner or officer.
            </p>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-muted">
                  New owner
                </label>
                <select
                  required
                  value={transferTargetUserId}
                  onChange={(e) => setTransferTargetUserId(e.target.value)}
                  className="w-full rounded-lg border border-line px-3 py-2.5 text-sm"
                >
                  <option value="" disabled>
                    Select a member
                  </option>
                  {transferCandidates.map((m) => (
                    <option key={m.user_id} value={m.user_id ?? ""}>
                      {m.first_name} {m.last_name} ({m.role ? ROLE_LABEL[m.role] : ""})
                    </option>
                  ))}
                </select>
                {transferCandidates.length === 0 && (
                  <p className="mt-1.5 text-[11px] text-ink-faint">
                    No eligible co-owners or officers yet -- promote someone
                    first.
                  </p>
                )}
              </div>
              {transferError && (
                <p className="text-sm text-bad">{transferError}</p>
              )}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="cursor-pointer rounded-control border border-line bg-white px-4 py-2.5 text-[13px] font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={transferring || !transferTargetUserId}
                className="cursor-pointer rounded-control bg-accent px-4 py-2.5 text-[13px] font-bold text-accent-ink disabled:opacity-50"
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 sm:items-center sm:p-4"
          onClick={() => setCheckinTargetUserId(null)}
        >
          <form
            onSubmit={handleManualCheckin}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:w-100 sm:max-w-[92vw] sm:rounded-2xl sm:p-7"
          >
            <div className="mb-1 text-lg font-extrabold">Add to meeting</div>
            <p className="mb-4 text-xs text-ink-muted">
              Marks this member as checked in without them going through the
              check-in flow. No form answers are recorded and location is not
              checked.
            </p>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-muted">
                  Meeting
                </label>
                <select
                  value={checkinMeetingId}
                  onChange={(e) => setCheckinMeetingId(e.target.value)}
                  className="w-full rounded-lg border border-line px-3 py-2.5 text-sm"
                >
                  {meetings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} — {new Date(m.start_time).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
              {checkinError && (
                <p className="text-sm text-bad">{checkinError}</p>
              )}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCheckinTargetUserId(null)}
                className="cursor-pointer rounded-control border border-line bg-white px-4 py-2.5 text-[13px] font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={checkinSubmitting}
                className="cursor-pointer rounded-control bg-accent px-4 py-2.5 text-[13px] font-bold text-accent-ink disabled:opacity-50"
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

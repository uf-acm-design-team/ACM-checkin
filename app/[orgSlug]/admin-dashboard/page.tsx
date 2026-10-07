"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { createClient } from "../../utils/supabase/client";
import { useBranding } from "@/app/components/BrandingProvider";
import { resolveBranding } from "@/lib/branding";
import AuditLogView from "@/app/components/AuditLogView";
import MembersTab from "./members-tab";
import { roleBadgeLabel } from "@/lib/org-roles";
import { Chip, Identity, Spinner } from "@/components/ui/primitives";
import BrandingTab from "./branding-tab";
import QRCodeTab from "./qr-code-tab";
import {
  parseAnswers,
  parseSchema,
  type AnswerMap,
  type FormSchema,
} from "@/lib/form-schema";
import { fromDateTimeLocal } from "@/lib/meeting-time";
import {
  attendanceFilename,
  buildAttendanceCsv,
  downloadCsv,
} from "@/lib/attendance-csv";
import { fetchOrgMembers, type OrgMember } from "@/lib/org-members";
import { pageRange, hasMore as computeHasMore } from "@/lib/stats-terms";

interface Organization {
  id: string;
  name: string;
  slug: string;
  branding: unknown;
}

interface Meeting {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  status: boolean;
  attendance_count: number;
  description: string | null;
  is_geo_locked: boolean;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  is_officer_only: boolean;
  requires_checkin_password: boolean;
  // Parsed once on fetch: the list needs its length for the badge and the CSV
  // export needs the questions themselves for its columns.
  form_schema: FormSchema;
}

// Blank form state for the create modal.
//
// Creation only collects the scheduling fields; questions are authored in the
// full-page editor (admin-dashboard/meetings/[meetingId]), which is where the
// officer lands right after creating. A form builder does not fit in a dialog.
const EMPTY_MEETING_DRAFT = {
  title: "",
  description: "",
  start_time: "",
  end_time: "",
  status: true,
  is_geo_locked: false,
  latitude: "",
  longitude: "",
  radius_meters: "200",
  is_officer_only: false,
  checkin_password: "",
};
type MeetingDraft = typeof EMPTY_MEETING_DRAFT;

interface CheckIn {
  first_name: string;
  last_name: string;
  email: string;
  grad_year: string;
  checked_in_at: string;
  answers: AnswerMap;
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "meetings", label: "Meetings" },
  { key: "attendance", label: "Attendance" },
  { key: "members", label: "Members" },
  { key: "qr-code", label: "QR Code" },
  { key: "audit-log", label: "Audit Log" },
  { key: "branding", label: "Branding" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

type MeetingFilter = "upcoming" | "past" | "all";

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

export default function AdminDashboard({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = React.use(params);
  const { user, isLoaded } = useUser();
  const branding = useBranding();
  const router = useRouter();
  const supabase = createClient();

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  // Mobile only: the sidebar collapses to an off-canvas drawer below lg.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // This user's role in THIS org (from memberships). Null until resolved.
  const [membershipRole, setMembershipRole] = useState<string | null>(null);
  // Global admin flag from attendees.admin. This is the developer/platform-admin
  // role, and it intentionally bypasses org membership checks so internal admins
  // can smoke-test any org route without a per-org membership row.
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [adminCheckFinished, setAdminCheckFinished] = useState(false);

  // Meetings
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [meetingFilter, setMeetingFilter] = useState<MeetingFilter>("upcoming");
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingDraft, setMeetingDraft] =
    useState<MeetingDraft>(EMPTY_MEETING_DRAFT);
  const [creatingMeeting, setCreatingMeeting] = useState(false);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(
    null,
  );

  // Attendance
  const [attendanceMeetingId, setAttendanceMeetingId] = useState<string | null>(
    null
  );
  const [checkIns, setCheckIns] = useState<Record<string, CheckIn[]>>({});
  const [checkInsLoading, setCheckInsLoading] = useState(false);
  const [checkInsLoadingMore, setCheckInsLoadingMore] = useState(false);
  // Page currently loaded per meeting -- "Load more" appends the next page
  // rather than re-fetching everything, same pattern as
  // components/stats/stats-view.tsx.
  const [checkInsPage, setCheckInsPage] = useState<Record<string, number>>({});
  const [checkInsTotal, setCheckInsTotal] = useState<Record<string, number>>({});

  // Members (Overview stats/officers panel only -- the Members tab itself
  // fetches and manages its own roster in members-tab.tsx)
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [, setMembersLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.push("/");
    }
  }, [isLoaded, user, router]);

  useEffect(() => {
    if (!isLoaded || !user || !adminCheckFinished) return;

    const fetchOrganization = async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, slug, branding")
        .eq("slug", orgSlug)
        .single();

      if (error || !data) {
        setError("Organization not found");
        setLoading(false);
        return;
      }

      // Access gate: you must hold a membership in THIS org to open its admin
      // dashboard. Without this any signed-in user could load any org's
      // dashboard by typing the slug.
      //
      // This is a UX gate, not the security boundary -- RLS decides what rows
      // actually come back (see 20260813000100_enable_rls_clerk.sql). It exists
      // so a non-member gets a clear "no access" message instead of a
      // confusingly empty dashboard.
      const { data: membership, error: membershipError } = await supabase
        .from("memberships")
        .select("role")
        .eq("org_id", data.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipError) {
        console.error("Membership check failed:", membershipError);
        setError("Couldn't verify your access to this organization");
        setLoading(false);
        return;
      }

      if (!membership) {
        if (isGlobalAdmin) {
          setMembershipRole("admin");
          setOrganization(data);
          setLoading(false);
          return;
        }

        router.replace(`/${orgSlug}`);
        setLoading(false);
        return;
      }

      const allowedOrgRoles = new Set(["officer", "co-owner", "owner", "admin"]);
      if (!allowedOrgRoles.has((membership.role ?? "").toLowerCase()) && !isGlobalAdmin) {
        router.replace(`/${orgSlug}`);
        setLoading(false);
        return;
      }

      setMembershipRole(membership.role ?? null);
      setOrganization(data);
      setLoading(false);
    };

    fetchOrganization();
  }, [orgSlug, supabase, isLoaded, user, adminCheckFinished, isGlobalAdmin]);

  // Global admin status (attendees.admin) -- distinct from the per-org
  // memberships.role above. Bypasses org membership entirely (see
  // 20260822000000_global_admin_no_org_bypass.sql) and grants the same
  // authority as 'owner' in the member-management RPCs
  // (_effective_org_role, has_org_role).
  useEffect(() => {
    if (!isLoaded || !user) return;

    supabase
      .from("attendees")
      .select("admin")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("Admin flag lookup failed:", error);
          setAdminCheckFinished(true);
          return;
        }
        setIsGlobalAdmin(Boolean(data?.admin));
        setAdminCheckFinished(true);
      });
  }, [isLoaded, user, supabase]);

  const fetchMeetings = useCallback(async () => {
    if (!organization) return;
    setMeetingsLoading(true);
    try {
      const { data, error } = await supabase
        .from("meetings")
        .select(
          "id, title, start_time, end_time, status, description, is_geo_locked, latitude, longitude, radius_meters, is_officer_only, requires_checkin_password, form_schema",
        )
        .eq("org_id", organization.id)
        .order("start_time", { ascending: false });

      if (error) {
        console.error("Error fetching meetings:", error);
        return;
      }

      const normalizedMeetings = (data || []).map((meeting) => ({
        ...meeting,
        form_schema: parseSchema(meeting.form_schema),
      }));

      // One request for every meeting's check-ins, tallied here -- this used to
      // fire a separate head-count query per meeting (N+1), which meant ~30
      // round trips for a semester of meetings before the tab could render.
      const meetingIds = normalizedMeetings.map((m) => m.id);
      const countsByMeeting: Record<string, number> = {};
      if (meetingIds.length > 0) {
        const { data: attendanceRows, error: countError } = await supabase
          .from("attendance")
          .select("meeting_id")
          .in("meeting_id", meetingIds);

        if (countError) {
          console.error("Error counting attendance:", countError);
        }
        for (const row of attendanceRows || []) {
          countsByMeeting[row.meeting_id] =
            (countsByMeeting[row.meeting_id] || 0) + 1;
        }
      }

      const nextMeetings = normalizedMeetings.map((meeting) => ({
        ...meeting,
        attendance_count: countsByMeeting[meeting.id] || 0,
      }));

      setMeetings(nextMeetings);
    } finally {
      setMeetingsLoading(false);
    }
  }, [organization, supabase]);

  const fetchMembers = useCallback(async () => {
    if (!organization) return;
    setMembersLoading(true);
    try {
      setMembers(await fetchOrgMembers(supabase, organization.id, orgSlug));
    } finally {
      setMembersLoading(false);
    }
  }, [organization, orgSlug, supabase]);

  useEffect(() => {
    if (!organization) return;
    fetchMeetings();
    fetchMembers();
  }, [organization, fetchMeetings, fetchMembers]);


  // Default the attendance dropdown to the most recent meeting.
  useEffect(() => {
    if (!attendanceMeetingId && meetings.length > 0) {
      setAttendanceMeetingId(meetings[0].id);
    }
  }, [meetings, attendanceMeetingId]);

  const ATTENDANCE_PAGE_SIZE = 25;

  const loadCheckInsPage = useCallback(
    async (meetingId: string, page: number) => {
      const { from, to } = pageRange(page, ATTENDANCE_PAGE_SIZE);
      const { data, error, count } = await supabase
        .from("attendance")
        .select(
          "checked_in_at, answers, attendee:attendee_id(first_name, last_name, email, grad_year)",
          { count: "exact" },
        )
        .eq("meeting_id", meetingId)
        .order("checked_in_at", { ascending: true })
        .range(from, to);

      if (error || !data) return;

      const rows: CheckIn[] = data.map((row: any) => ({
        first_name: row.attendee?.first_name ?? "",
        last_name: row.attendee?.last_name ?? "",
        email: row.attendee?.email ?? "",
        grad_year: row.attendee?.grad_year ?? "",
        checked_in_at: row.checked_in_at,
        answers: parseAnswers(row.answers),
      }));

      setCheckIns((prev) => ({
        ...prev,
        [meetingId]: page === 1 ? rows : [...(prev[meetingId] ?? []), ...rows],
      }));
      setCheckInsPage((prev) => ({ ...prev, [meetingId]: page }));
      setCheckInsTotal((prev) => ({ ...prev, [meetingId]: count ?? rows.length }));
    },
    [supabase],
  );

  useEffect(() => {
    const meetingId = attendanceMeetingId;
    if (!meetingId || checkIns[meetingId]) return;
    setCheckInsLoading(true);
    loadCheckInsPage(meetingId, 1).finally(() => setCheckInsLoading(false));
  }, [attendanceMeetingId, checkIns, loadCheckInsPage]);

  const loadMoreCheckIns = async () => {
    const meetingId = attendanceMeetingId;
    if (!meetingId) return;
    setCheckInsLoadingMore(true);
    try {
      await loadCheckInsPage(meetingId, (checkInsPage[meetingId] ?? 1) + 1);
    } finally {
      setCheckInsLoadingMore(false);
    }
  };

  const openCreateMeeting = () => {
    setMeetingDraft(EMPTY_MEETING_DRAFT);
    setMeetingError(null);
    setShowMeetingModal(true);
  };

  // Editing happens in the full-page editor, which owns the form builder along
  // with these scheduling fields. The modal here is create-only.
  const openEditMeeting = (m: Meeting) => {
    router.push(`/${orgSlug}/admin-dashboard/meetings/${m.id}`);
  };

  // Fill lat/lng from the officer's current position. They are expected to be
  // standing at the meeting location when setting this up; the alternative
  // (typing coordinates) is unusable on a phone.
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMeetingError("This browser doesn't support geolocation.");
      return;
    }
    setLocating(true);
    setMeetingError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMeetingDraft((d) => ({
          ...d,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setLocating(false);
      },
      (err) => {
        setMeetingError(
          err.code === err.PERMISSION_DENIED
            ? "Location access denied. Allow it, or enter coordinates manually."
            : "Couldn't read your location. Check that GPS is on.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handleSaveMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !user) return;

    // Validate before hitting the DB so the officer gets a specific message
    // rather than a constraint error.
    if (meetingDraft.end_time && meetingDraft.start_time > meetingDraft.end_time) {
      setMeetingError("End time must be after the start time.");
      return;
    }

    // Convert to instants before anything else so an unparseable value is
    // caught here rather than becoming a NULL start_time in the database.
    const startIso = fromDateTimeLocal(meetingDraft.start_time);
    const endIso = fromDateTimeLocal(meetingDraft.end_time);
    if (!startIso || !endIso) {
      setMeetingError("Enter a valid start and end time.");
      return;
    }

    const lat = meetingDraft.latitude.trim();
    const lng = meetingDraft.longitude.trim();
    if (meetingDraft.is_geo_locked && (!lat || !lng)) {
      setMeetingError(
        "Geo-locked meetings need a location. Use “Use current location” or enter coordinates.",
      );
      return;
    }

    const radius = Number(meetingDraft.radius_meters);
    if (meetingDraft.is_geo_locked && (!Number.isFinite(radius) || radius <= 0)) {
      setMeetingError("Radius must be a positive number of meters.");
      return;
    }

    setCreatingMeeting(true);
    setMeetingError(null);

    // Only persist coordinates when geolocking is on -- otherwise a meeting
    // that was un-geolocked would keep stale coordinates that mean nothing.
    const payload = {
      title: meetingDraft.title.trim(),
      description: meetingDraft.description.trim() || null,
      // Explicit instants -- see lib/meeting-time.ts. The bare datetime-local
      // string would be read in the server's zone (UTC), not the club's.
      start_time: startIso,
      end_time: endIso,
      status: meetingDraft.status,
      is_geo_locked: meetingDraft.is_geo_locked,
      latitude: meetingDraft.is_geo_locked ? Number(lat) : null,
      longitude: meetingDraft.is_geo_locked ? Number(lng) : null,
      radius_meters: meetingDraft.is_geo_locked ? radius : null,
      is_officer_only: meetingDraft.is_officer_only,
      checkin_password: meetingDraft.checkin_password.trim() || null,
    };

    try {
      const { data: created, error } = await supabase
        .from("meetings")
        .insert({ ...payload, org_id: organization.id, created_by: user.id })
        .select("id")
        .single();

      if (error) {
        setMeetingError(error.message);
        return;
      }

      setShowMeetingModal(false);
      setMeetingDraft(EMPTY_MEETING_DRAFT);

      // Land in the editor so the next step -- adding check-in questions -- is
      // in front of the officer rather than behind an Edit button.
      if (created?.id) {
        router.push(`/${orgSlug}/admin-dashboard/meetings/${created.id}`);
        return;
      }

      // Make sure the meeting just created is actually visible. Creating one
      // that already ended would otherwise drop it out of the default
      // "Upcoming" view, which reads as "the save didn't work".
      const endsInPast =
        new Date(payload.end_time || payload.start_time).getTime() < Date.now();
      if (endsInPast && meetingFilter === "upcoming") {
        setMeetingFilter("all");
      }

      fetchMeetings();
    } catch {
      setMeetingError("Failed to save meeting");
    } finally {
      setCreatingMeeting(false);
    }
  };

  // Open/close a meeting for check-in. This is the switch guests are gated on:
  // meetings_anon_read_active only exposes rows with status = true.
  const toggleMeetingStatus = async (m: Meeting) => {
    const nextStatus = !m.status;
    setMeetingError(null);

    const { error } = await supabase
      .from("meetings")
      .update({ status: nextStatus })
      .eq("id", m.id)
      .select("id, status");

    if (error) {
      setMeetingError(error.message);
      return;
    }

    setMeetings((prev) =>
      prev.map((meeting) =>
        meeting.id === m.id ? { ...meeting, status: nextStatus } : meeting,
      ),
    );
  };

  const handleDeleteMeeting = async (m: Meeting) => {
    // Check-ins cascade with the meeting as of
    // 20260903000000_meeting_delete_cascades_attendance.sql. Before that the FK
    // had no referential action, so this refused outright whenever
    // attendance_count > 0 -- correct about the database, but it left test and
    // mistake meetings undeletable from inside the app forever.
    //
    // The count is spelled out in the prompt rather than merely warned about:
    // "this cannot be undone" is easy to click past, whereas a number of
    // records is the thing an officer actually needs to weigh. Two sentences,
    // one confirm -- a second dialog would just train people to dismiss both.
    const message =
      m.attendance_count > 0
        ? `Delete "${m.title}"?\n\nThis meeting has ${m.attendance_count} check-in${
            m.attendance_count === 1 ? "" : "s"
          }. Deleting it will permanently remove ${
            m.attendance_count === 1 ? "that attendance record" : "those attendance records"
          } too.\n\nThis cannot be undone.`
        : `Delete "${m.title}"? This cannot be undone.`;
    if (!confirm(message)) return;

    setDeletingMeetingId(m.id);
    try {
      const { error } = await supabase.from("meetings").delete().eq("id", m.id);
      if (error) {
        setMeetingError(error.message);
        return;
      }
      fetchMeetings();
    } finally {
      setDeletingMeetingId(null);
    }
  };

  const [exportingCsv, setExportingCsv] = useState(false);

  // One column per form question, appended after the fixed attendee columns.
  // See lib/attendance-csv.ts -- shared with the meeting editor's Responses tab
  // so both produce the same file.
  //
  // Fetches the full attendee set itself rather than exporting `checkIns`,
  // which now only holds whatever pages have been loaded in the UI -- an
  // export must never silently truncate to the last-loaded page.
  const downloadAttendanceCSV = async () => {
    const meeting = meetings.find((m) => m.id === attendanceMeetingId);
    if (!meeting) return;

    setExportingCsv(true);
    try {
      const { data, error } = await supabase
        .from("attendance")
        .select(
          "checked_in_at, answers, attendee:attendee_id(first_name, last_name, email, grad_year)",
        )
        .eq("meeting_id", meeting.id)
        .order("checked_in_at", { ascending: true });

      if (error || !data) return;

      const rows: CheckIn[] = data.map((row: any) => ({
        first_name: row.attendee?.first_name ?? "",
        last_name: row.attendee?.last_name ?? "",
        email: row.attendee?.email ?? "",
        grad_year: row.attendee?.grad_year ?? "",
        checked_in_at: row.checked_in_at,
        answers: parseAnswers(row.answers),
      }));

      downloadCsv(
        buildAttendanceCsv(rows, meeting.form_schema),
        attendanceFilename(meeting.title),
      );

      // Best-effort: the export already happened, so a logging failure
      // shouldn't surface as an error to the officer who just downloaded it.
      supabase
        .rpc("log_attendance_export", {
          p_meeting_id: meeting.id,
          p_row_count: rows.length,
        })
        .then(({ error: logError }) => {
          if (logError) console.error("Failed to log attendance export:", logError);
        });
    } finally {
      setExportingCsv(false);
    }
  };

  // The upcoming/past boundary. Held in state and refreshed on a timer rather
  // than read inline: `Date.now()` in the render body differs on every pass, so
  // the useMemos below would never cache. A minute of drift is irrelevant for
  // deciding whether a meeting has ended.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // "Upcoming" keys off end_time, not start_time: a meeting that is currently
  // running is still upcoming as far as an officer is concerned -- people are
  // checking into it. Keying off start_time filed in-progress meetings under
  // "Past" the moment they began, which made a just-created meeting look like
  // it had failed to save.
  const meetingEnd = (m: Meeting) =>
    new Date(m.end_time || m.start_time).getTime();

  const upcomingMeetings = useMemo(
    () =>
      meetings
        .filter((m) => meetingEnd(m) >= now)
        .sort(
          (a, b) =>
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        ),
    [meetings, now]
  );
  const pastMeetings = useMemo(
    () => meetings.filter((m) => meetingEnd(m) < now),
    [meetings, now]
  );

  const filteredMeetings =
    meetingFilter === "upcoming"
      ? upcomingMeetings
      : meetingFilter === "past"
        ? pastMeetings
        : meetings;

  // The overview card answers "what is actually happening next", which is not
  // the same question the Upcoming FILTER answers. A meeting an officer has
  // closed is still legitimately listed under Upcoming -- it is on the calendar
  // and can be reopened -- but it is not what the club does next, and surfacing
  // it here meant a finished test meeting sat on the dashboard indefinitely,
  // labelled "Closed" by the very card calling it the next meeting.
  //
  // Falls back to the first upcoming meeting when every one of them is closed,
  // so the card degrades to the old behaviour rather than to an empty state
  // that would read as "nothing scheduled" when something plainly is.
  const nextMeeting =
    upcomingMeetings.find((m) => m.status) ?? upcomingMeetings[0];
  const totalCheckIns = meetings.reduce((sum, m) => sum + m.attendance_count, 0);
  const activeMembers = members.filter((m) => m.status === "active");
  const officers = activeMembers.filter(
    (m) => m.role && m.role.toLowerCase() !== "member",
  );

  // Audit Log and Branding are co-owner/owner (or global admin) tools --
  // matches the audit_owner_read and orgs_officer_update RLS policies from
  // 20260824000000_member_management_and_coowner.sql, so this only prevents
  // showing a control that would fail rather than being the real gate.
  const canManageOrg =
    isGlobalAdmin || membershipRole === "owner" || membershipRole === "co-owner";

  const visibleTabs = useMemo(
    () =>
      TABS.filter((tab) => {
        if (tab.key === "audit-log" || tab.key === "branding") return canManageOrg;
        return true;
      }),
    [canManageOrg]
  );

  // If the active tab is no longer visible (admin flag resolved to false after
  // the tab was already selected), fall back to overview.
  useEffect(() => {
    if (!visibleTabs.some((t) => t.key === activeTab)) {
      setActiveTab("overview");
    }
  }, [visibleTabs, activeTab]);

  // While the mobile drawer is open, freeze the page behind it and let Escape
  // dismiss it -- otherwise the content scrolls under the overlay and the only
  // way out is the backdrop tap.
  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [sidebarOpen]);

  const selectedMeeting = meetings.find((m) => m.id === attendanceMeetingId);
  const selectedCheckIns = checkIns[attendanceMeetingId ?? ""];

  const roleBadge = roleBadgeLabel(membershipRole, isGlobalAdmin);

  const userInitials = initials(
    user?.fullName || user?.primaryEmailAddress?.emailAddress || "?"
  );

  if (!isLoaded || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-3 bg-canvas">
        <Spinner size={26} />
        <span className="text-sm text-ink-faint">Loading…</span>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas p-4">
        <div className="w-full max-w-md rounded-card border border-line bg-white p-8 text-center">
          <h1 className="mb-2 text-2xl font-extrabold text-ink">Admin</h1>
          <p className="text-ink-muted">{error}</p>
        </div>
      </div>
    );
  }

  const activeLabel = TABS.find((t) => t.key === activeTab)?.label;

  return (
    <div className="flex min-h-dvh bg-canvas text-ink">
      {/* Backdrop for the mobile drawer. Hidden at lg, where the sidebar is
          permanently docked. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar. White, not branded: this console is the same design system
          as the public side, and a seven-column table has to stay legible next
          to any org's palette. The org's identity lives in the crest at the top
          and nowhere else here. Off-canvas drawer below lg, static column at lg
          and up. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-none flex-col gap-1 overflow-y-auto border-r border-line bg-surface p-3.5 pt-5 text-ink transition-transform duration-200 lg:static lg:z-auto lg:w-[236px] lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-5 flex items-center gap-2.5 px-2">
          {/* The slot is always filled: the org's crest when it has one, a
              monogram of its name when it doesn't -- never another club's. */}
          <Identity
            label={initials(branding.name || organization.name)}
            src={branding.logo.crest}
            size="sm"
            solid
            className="h-8 w-8"
          />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-bold text-ink">
              {branding.name || organization.name}
            </div>
            <div className="text-[11.5px] text-ink-faint">
              {roleBadge ?? "Officer"}
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="ml-auto cursor-pointer rounded-control p-1.5 text-ink-faint hover:bg-surface-sunken hover:text-ink lg:hidden"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {visibleTabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setSidebarOpen(false);
              }}
              className={`flex cursor-pointer items-center rounded-control px-3 py-2.5 text-left text-sm transition-colors ${
                active
                  ? "bg-accent-soft font-bold text-accent-on-soft"
                  : "font-semibold text-ink-muted hover:bg-surface-sunken hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          );
        })}

        {/* The way out. OrgNav deliberately doesn't render on this route (it
            would collide with this sidebar + the light top bar), so without
            this the admin console is a dead end. */}
        <Link
          href={`/${orgSlug}`}
          className="mt-auto flex items-center gap-2.5 border-t border-line-soft px-3 pt-4 pb-2.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          <svg
            className="h-4 w-4 flex-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Exit to {branding.name || organization.name}
        </Link>
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-control px-3 py-2 text-xs font-semibold text-ink-faint transition-colors hover:text-ink-muted"
        >
          <span className="w-4 flex-none" aria-hidden="true" />
          All clubs
        </Link>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 flex-none items-center justify-between gap-3 border-b border-line bg-surface px-4 sm:px-6 lg:h-18 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              className="-ml-1 cursor-pointer rounded-lg p-2 text-ink-strong hover:bg-surface-sunken lg:hidden"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="truncate text-lg font-bold tracking-[-0.02em] sm:text-xl">
              {activeLabel}
            </div>
          </div>
          <div className="flex flex-none items-center gap-3.5">
            {/* The full date is noise on a phone -- the avatar is what matters. */}
            <span className="hidden text-[13px] font-medium text-ink-muted lg:inline">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            {roleBadge && (
              <Chip tone="accent" className="hidden sm:inline-flex">
                {roleBadge}
              </Chip>
            )}
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent-on-soft">
              {userInitials}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <>
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:mb-7 xl:grid-cols-4">
                {[
                  {
                    label: "Total Members",
                    value: String(activeMembers.length),
                    sub: "Active roster",
                  },
                  {
                    label: "Upcoming Meetings",
                    value: String(upcomingMeetings.length),
                    sub: "Scheduled ahead",
                  },
                  {
                    label: "Total Check-Ins",
                    value: String(totalCheckIns),
                    sub: "Across all meetings",
                  },
                  {
                    label: "Meetings Held",
                    value: String(pastMeetings.length),
                    sub: "So far",
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-card border border-line bg-white p-5"
                  >
                    <div className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                      {stat.label}
                    </div>
                    <div className="mt-2 text-3xl font-extrabold">
                      {stat.value}
                    </div>
                    <div className="mt-1.5 text-xs font-semibold text-accent">
                      {stat.sub}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
                <div className="rounded-card border border-line bg-white p-5 sm:p-6">
                  <div className="mb-4 text-base font-bold">Next Meeting</div>
                  {nextMeeting ? (
                    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
                      <div className="min-w-0">
                        <div className="text-lg font-extrabold wrap-break-word">
                          {nextMeeting.title}
                        </div>
                        <div className="mt-1.5 text-sm font-medium text-ink-muted">
                          {fmtDate(nextMeeting.start_time)} ·{" "}
                          {fmtTime(nextMeeting.start_time)} –{" "}
                          {fmtTime(nextMeeting.end_time)}
                        </div>
                        <span
                          className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold ${
                            nextMeeting.status
                              ? "bg-good-surface text-good-ink"
                              : "bg-surface-sunken text-ink-muted"
                          }`}
                        >
                          {nextMeeting.status ? "Active" : "Closed"}
                        </span>
                      </div>
                      <button
                        onClick={() => setActiveTab("meetings")}
                        className="flex-none cursor-pointer rounded-control border border-line bg-white px-4 py-2 text-[13px] font-bold text-ink-strong transition-all hover:bg-canvas"
                      >
                        View all
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-ink-muted">
                      No upcoming meetings scheduled.
                    </div>
                  )}
                </div>

                <div className="rounded-card border border-line bg-white p-5 sm:p-6">
                  <div className="mb-4 text-base font-bold">Officers</div>
                  {officers.length > 0 ? (
                    <div className="flex flex-col gap-3.5">
                      {officers.map((o) => (
                        <div
                          key={o.user_id}
                          className="flex items-center gap-3"
                        >
                          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
                            {initials(`${o.first_name} ${o.last_name}`)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold">
                              {o.first_name} {o.last_name}
                            </div>
                            <div className="text-xs font-medium text-ink-muted">
                              {o.role}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-ink-muted">
                      No officers on the roster.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* MEETINGS */}
          {activeTab === "meetings" && (
            <>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex gap-1.5 rounded-control bg-surface-sunken p-1">
                  {(["upcoming", "past", "all"] as MeetingFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setMeetingFilter(f)}
                      className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-[13px] font-bold capitalize transition-all sm:flex-none sm:px-4 ${
                        meetingFilter === f
                          ? "bg-white text-ink-strong shadow-sm"
                          : "text-ink-muted"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <button
                  onClick={openCreateMeeting}
                  className="w-full cursor-pointer rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-deep sm:w-auto"
                >
                  + New Meeting
                </button>
              </div>

              <div className="overflow-hidden rounded-card border border-line bg-white">
                {/* Column headers only make sense once the rows are actually a
                    grid -- below lg each row renders as a stacked card. */}
                <div className="hidden grid-cols-[2fr_1.3fr_1.3fr_1fr_100px_170px] gap-4 border-b border-line px-5 py-3.5 text-xs font-bold tracking-wide text-ink-muted uppercase lg:grid">
                  <div>Meeting</div>
                  <div>Start</div>
                  <div>End</div>
                  <div>Attendance</div>
                  <div>Status</div>
                  <div className="text-right">Actions</div>
                </div>
                {/* Errors from the row actions (toggle/delete) surface here --
                    the modal is closed when those run. */}
                {meetingError && !showMeetingModal && (
                  <div className="border-b border-bad-line bg-bad-surface px-5 py-3 text-sm text-bad-ink">
                    {meetingError}
                  </div>
                )}
                {meetingsLoading ? (
                  <div className="p-10 text-center text-sm text-ink-muted">
                    Loading meetings...
                  </div>
                ) : filteredMeetings.length > 0 ? (
                  filteredMeetings.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => {
                        setAttendanceMeetingId(m.id);
                        setActiveTab("attendance");
                      }}
                      className="flex cursor-pointer flex-col gap-2 border-b border-line-soft px-4 py-4 text-sm transition-all last:border-b-0 hover:bg-canvas sm:px-5 lg:grid lg:grid-cols-[2fr_1.3fr_1.3fr_1fr_100px_170px] lg:items-center lg:gap-4"
                    >
                      <div className="font-bold wrap-break-word">
                        {m.title}
                        {m.is_geo_locked && (
                          <span
                            title={`Geo-locked to ${m.radius_meters ?? 200}m`}
                            className="ml-2 inline-block rounded bg-warn-surface px-1.5 py-0.5 text-[10px] font-bold text-warn-ink"
                          >
                            📍 {m.radius_meters ?? 200}m
                          </span>
                        )}
                        {m.form_schema.length > 0 && (
                          <span
                            title={`${m.form_schema.length} check-in question(s)`}
                            className="ml-2 inline-block rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent"
                          >
                            {m.form_schema.length} question
                            {m.form_schema.length === 1 ? "" : "s"}
                          </span>
                        )}
                        {m.is_officer_only && (
                          <span
                            title="Hidden from regular members"
                            className="ml-2 inline-block rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700"
                          >
                            Officers only
                          </span>
                        )}
                        {m.requires_checkin_password && (
                          <span
                            title="Requires a password to check in"
                            className="ml-2 inline-block rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-bold text-ink-strong"
                          >
                            🔒 Password
                          </span>
                        )}
                      </div>
                      {/* The stacked layout has no column headers, so each
                          value carries its own label below lg. */}
                      <div className="font-medium text-ink-strong">
                        <span className="text-ink-faint lg:hidden">Start: </span>
                        {fmtDate(m.start_time)}, {fmtTime(m.start_time)}
                      </div>
                      <div className="font-medium text-ink-strong">
                        <span className="text-ink-faint lg:hidden">End: </span>
                        {fmtDate(m.end_time)}, {fmtTime(m.end_time)}
                      </div>
                      <div className="font-bold">
                        {m.attendance_count}{" "}
                        <span className="font-medium text-ink-muted">
                          checked in
                        </span>
                      </div>
                      <div>
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            m.status
                              ? "bg-good-surface text-good-ink"
                              : "bg-surface-sunken text-ink-muted"
                          }`}
                        >
                          {m.status ? "Active" : "Closed"}
                        </span>
                      </div>
                      {/* stopPropagation on each: the row itself navigates to
                          the attendance tab. */}
                      <div className="mt-1 flex flex-wrap gap-1.5 lg:mt-0 lg:justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void toggleMeetingStatus(m);
                          }}
                          title={
                            m.status
                              ? "Close check-in for this meeting"
                              : "Open check-in for this meeting"
                          }
                          className="cursor-pointer rounded-md border border-line px-2 py-1 text-[11px] font-bold text-ink-strong hover:bg-surface-sunken"
                        >
                          {m.status ? "Close" : "Open"}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditMeeting(m);
                          }}
                          className="cursor-pointer rounded-md border border-line px-2 py-1 text-[11px] font-bold text-ink-strong hover:bg-surface-sunken"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMeeting(m);
                          }}
                          disabled={deletingMeetingId === m.id}
                          className="cursor-pointer rounded-md border border-bad-line px-2 py-1 text-[11px] font-bold text-bad hover:bg-bad-surface disabled:opacity-50"
                        >
                          {deletingMeetingId === m.id ? "..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-10 text-center text-sm text-ink-muted">
                    No meetings in this view.
                    {meetings.length > 0 && meetingFilter !== "all" && (
                      <>
                        {" "}
                        <button
                          onClick={() => setMeetingFilter("all")}
                          className="cursor-pointer font-bold text-accent underline"
                        >
                          Show all {meetings.length}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ATTENDANCE */}
          {activeTab === "attendance" && (
            <>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
                <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                  <label
                    htmlFor="attendance-meeting"
                    className="text-sm font-bold text-ink-muted"
                  >
                    Meeting:
                  </label>
                  <select
                    id="attendance-meeting"
                    value={attendanceMeetingId ?? ""}
                    onChange={(e) => setAttendanceMeetingId(e.target.value)}
                    className="w-full rounded-control border border-line bg-white px-3.5 py-2.5 text-sm font-semibold sm:w-auto sm:min-w-70"
                  >
                    {meetings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} — {fmtDate(m.start_time)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={downloadAttendanceCSV}
                  disabled={!selectedMeeting?.attendance_count || exportingCsv}
                  className="w-full cursor-pointer rounded-control border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink-strong transition-colors hover:bg-surface-sunken disabled:opacity-50 sm:w-auto"
                >
                  {exportingCsv ? "Preparing…" : "↓ Download attendance (.csv)"}
                </button>
              </div>

              {selectedMeeting ? (
                <div className="overflow-hidden rounded-card border border-line bg-white">
                  <div className="flex flex-col gap-1 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="min-w-0">
                      <div className="text-base font-extrabold wrap-break-word">
                        {selectedMeeting.title}
                      </div>
                      <div className="mt-0.5 text-xs font-semibold text-ink-muted">
                        {fmtDate(selectedMeeting.start_time)} ·{" "}
                        {fmtTime(selectedMeeting.start_time)}
                      </div>
                    </div>
                    <div className="flex-none text-[13px] font-bold text-ink-strong">
                      {selectedMeeting.attendance_count} checked in
                    </div>
                  </div>
                  <div className="hidden grid-cols-[2fr_2fr_1fr_1.4fr] gap-4 border-b border-line px-5 py-3.5 text-xs font-bold tracking-wide text-ink-muted uppercase md:grid">
                    <div>Attendee</div>
                    <div>Email</div>
                    <div>Class</div>
                    <div>Checked In</div>
                  </div>
                  {checkInsLoading && !selectedCheckIns ? (
                    <div className="p-10 text-center text-sm text-ink-muted">
                      Loading attendees...
                    </div>
                  ) : selectedCheckIns && selectedCheckIns.length > 0 ? (
                    selectedCheckIns.map((row, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col gap-1.5 border-b border-line-soft px-4 py-3.5 text-sm last:border-b-0 sm:px-5 md:grid md:grid-cols-[2fr_2fr_1fr_1.4fr] md:items-center md:gap-4"
                      >
                        <div className="flex min-w-0 items-center gap-2.5 font-bold">
                          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
                            {initials(`${row.first_name} ${row.last_name}`)}
                          </div>
                          <span className="min-w-0 wrap-break-word">
                            {row.first_name} {row.last_name}
                          </span>
                        </div>
                        {/* Long addresses wrap on mobile rather than truncate --
                            a stacked card has the room, and a clipped email is
                            useless to an officer. */}
                        <div className="text-[13px] font-medium break-all text-ink-strong md:truncate md:break-normal">
                          {row.email}
                        </div>
                        <div className="font-medium text-ink-strong">
                          {row.grad_year ? `Class of ${row.grad_year}` : "—"}
                        </div>
                        <div className="text-[13px] font-medium text-ink-strong">
                          <span className="text-ink-faint md:hidden">
                            Checked in:{" "}
                          </span>
                          {new Date(row.checked_in_at).toLocaleString()}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-10 text-center text-sm text-ink-muted">
                      No attendees for this meeting.
                    </div>
                  )}
                  {selectedMeeting &&
                    computeHasMore(
                      checkInsPage[selectedMeeting.id] ?? 1,
                      ATTENDANCE_PAGE_SIZE,
                      checkInsTotal[selectedMeeting.id] ?? 0,
                    ) && (
                      <div className="border-t border-line-soft p-4 text-center">
                        <button
                          onClick={loadMoreCheckIns}
                          disabled={checkInsLoadingMore}
                          className="cursor-pointer rounded-control border border-line bg-white px-4 py-2 text-[13px] font-bold text-ink-strong hover:bg-canvas disabled:opacity-50"
                        >
                          {checkInsLoadingMore ? "Loading…" : "Load more"}
                        </button>
                      </div>
                    )}
                </div>
              ) : (
                <div className="rounded-card border border-line bg-white p-10 text-center text-sm text-ink-muted">
                  No meetings yet.
                </div>
              )}
            </>
          )}

          {/* MEMBERS */}
          {activeTab === "members" && (
            <MembersTab
              orgId={organization.id}
              orgSlug={orgSlug}
              membershipRole={membershipRole}
              isGlobalAdmin={isGlobalAdmin}
              meetings={meetings}
            />
          )}
          {/* QR CODE */}
          {activeTab === "qr-code" && (
            <QRCodeTab
              organizationName={organization.name}
              orgSlug={organization.slug}
            />
          )}
          {/* AUDIT LOG */}
          {activeTab === "audit-log" && canManageOrg && (
            <AuditLogView
              scope="org"
              orgId={organization.id}
              emptyMessage="No activity recorded yet for this organization."
            />
          )}

          {/* BRANDING */}
          {activeTab === "branding" && canManageOrg && (
            <BrandingTab
              orgId={organization.id}
              branding={resolveBranding(organization.branding)}
              onSaved={(next) =>
                setOrganization((prev) => (prev ? { ...prev, branding: next } : prev))
              }
            />
          )}
        </main>
      </div>

      {/* MEETING MODAL -- create and edit share this form */}
      {showMeetingModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 sm:items-center sm:p-4"
          onClick={() => setShowMeetingModal(false)}
        >
          <form
            onSubmit={handleSaveMeeting}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:max-h-[90dvh] sm:w-120 sm:max-w-[92vw] sm:rounded-2xl sm:p-7"
          >
            <div className="mb-1 text-lg font-extrabold">New Meeting</div>
            <p className="mb-4 text-xs text-ink-muted">
              This is all a meeting needs. You can optionally add check-in
              questions afterwards.
            </p>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-muted">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={meetingDraft.title}
                  onChange={(e) =>
                    setMeetingDraft({ ...meetingDraft, title: e.target.value })
                  }
                  placeholder="Meeting title"
                  className="w-full rounded-lg border border-line px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-muted">
                  Description <span className="font-medium">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={meetingDraft.description}
                  onChange={(e) =>
                    setMeetingDraft({
                      ...meetingDraft,
                      description: e.target.value,
                    })
                  }
                  placeholder="What's this meeting about?"
                  className="w-full resize-y rounded-lg border border-line px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-muted">
                  Start Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={meetingDraft.start_time}
                  onChange={(e) =>
                    setMeetingDraft({
                      ...meetingDraft,
                      start_time: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-line px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-muted">
                  End Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={meetingDraft.end_time}
                  onChange={(e) =>
                    setMeetingDraft({
                      ...meetingDraft,
                      end_time: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-line px-3 py-2.5 text-sm"
                />
              </div>
              {/* Open for check-in. Guests only ever see status = true
                  meetings (meetings_anon_read_active), so this is the switch
                  that makes a meeting checkin-able. */}
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3">
                <input
                  type="checkbox"
                  checked={meetingDraft.status}
                  onChange={(e) =>
                    setMeetingDraft({
                      ...meetingDraft,
                      status: e.target.checked,
                    })
                  }
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-bold">Open for check-in</span>
                  <span className="block text-xs text-ink-muted">
                    Members and guests can check in while this is on.
                  </span>
                </span>
              </label>

              <div className="rounded-lg border border-line p-3">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={meetingDraft.is_geo_locked}
                    onChange={(e) =>
                      setMeetingDraft({
                        ...meetingDraft,
                        is_geo_locked: e.target.checked,
                      })
                    }
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    <span className="font-bold">Require being on location</span>
                    <span className="block text-xs text-ink-muted">
                      Check-in is refused beyond the radius below.
                    </span>
                  </span>
                </label>

                {meetingDraft.is_geo_locked && (
                  <div className="mt-3 flex flex-col gap-2.5 border-t border-line-soft pt-3">
                    <button
                      type="button"
                      onClick={useCurrentLocation}
                      disabled={locating}
                      className="cursor-pointer rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink-strong hover:bg-canvas disabled:opacity-50"
                    >
                      {locating ? "Getting location..." : "📍 Use current location"}
                    </button>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-ink-muted">
                          Latitude
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={meetingDraft.latitude}
                          onChange={(e) =>
                            setMeetingDraft({
                              ...meetingDraft,
                              latitude: e.target.value,
                            })
                          }
                          placeholder="29.648"
                          className="w-full rounded-lg border border-line px-2.5 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-ink-muted">
                          Longitude
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={meetingDraft.longitude}
                          onChange={(e) =>
                            setMeetingDraft({
                              ...meetingDraft,
                              longitude: e.target.value,
                            })
                          }
                          placeholder="-82.344"
                          className="w-full rounded-lg border border-line px-2.5 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-ink-muted">
                        Radius (meters)
                      </label>
                      <input
                        type="number"
                        min={10}
                        step={10}
                        value={meetingDraft.radius_meters}
                        onChange={(e) =>
                          setMeetingDraft({
                            ...meetingDraft,
                            radius_meters: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-line px-2.5 py-2 text-sm"
                      />
                      <p className="mt-1 text-[11px] text-ink-muted">
                        200m suits a lecture hall. Phone GPS is only accurate to
                        roughly 10–50m indoors, so avoid going much tighter.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3">
                <input
                  type="checkbox"
                  checked={meetingDraft.is_officer_only}
                  onChange={(e) =>
                    setMeetingDraft({
                      ...meetingDraft,
                      is_officer_only: e.target.checked,
                    })
                  }
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-bold">Officers only</span>
                  <span className="block text-xs text-ink-muted">
                    Hidden from regular members entirely -- doesn&apos;t appear
                    on their check-in page or count toward their attendance.
                  </span>
                </span>
              </label>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-ink-muted">
                  Password <span className="font-medium">(optional)</span>
                </label>
                <input
                  type="text"
                  value={meetingDraft.checkin_password}
                  onChange={(e) =>
                    setMeetingDraft({
                      ...meetingDraft,
                      checkin_password: e.target.value,
                    })
                  }
                  placeholder="Leave blank for no password"
                  className="w-full rounded-lg border border-line px-3 py-2.5 text-sm"
                />
                <p className="mt-1 text-[11px] text-ink-muted">
                  Required from everyone checking in, guest or member.
                </p>
              </div>

              {meetingError && (
                <p className="text-sm text-bad">{meetingError}</p>
              )}
            </div>
            {/* Primary action first in the DOM but visually last on desktop --
                on mobile the stacked order puts Save at the top of the thumb's
                reach. */}
            <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowMeetingModal(false)}
                className="cursor-pointer rounded-control border border-line bg-white px-4.5 py-2.5 text-[13px] font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingMeeting}
                className="cursor-pointer rounded-control bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-ink transition-colors hover:bg-accent-deep disabled:opacity-50"
              >
                {creatingMeeting ? "Saving..." : "Create Meeting"}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

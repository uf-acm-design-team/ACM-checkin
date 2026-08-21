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
import BrandingTab from "./branding-tab";
import {
  parseAnswers,
  parseSchema,
  type AnswerMap,
  type FormSchema,
} from "@/lib/form-schema";
import {
  attendanceFilename,
  buildAttendanceCsv,
  downloadCsv,
} from "@/lib/attendance-csv";

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

interface Member {
  user_id: string;
  role: string;
  first_name: string;
  last_name: string;
  email: string;
  grad_year: string;
  attendance_count: number;
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "meetings", label: "Meetings" },
  { key: "attendance", label: "Attendance" },
  { key: "members", label: "Members" },
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

  // Members (Overview stats/officers panel only -- the Members tab itself
  // fetches and manages its own roster in members-tab.tsx)
  const [members, setMembers] = useState<Member[]>([]);
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
      const { data: memberships, error } = await supabase
        .from("memberships")
        .select("user_id, role")
        .eq("org_id", organization.id);

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
          (attendees || []).map((a) => [a.user_id, a])
        );

        const attendeeIds = (attendees || []).map((a) => a.id);
        if (attendeeIds.length > 0) {
          const { data: attendanceRows } = await supabase
            .from("attendance")
            .select("attendee_id")
            .eq("org_id", organization.id)
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
        })
      );
    } finally {
      setMembersLoading(false);
    }
  }, [organization, supabase]);

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

  useEffect(() => {
    const meetingId = attendanceMeetingId;
    if (!meetingId || checkIns[meetingId]) return;
    const fetchCheckIns = async () => {
      setCheckInsLoading(true);
      try {
        const { data, error } = await supabase
          .from("attendance")
          .select(
            "checked_in_at, answers, attendee:attendee_id(first_name, last_name, email, grad_year)"
          )
          .eq("meeting_id", meetingId);

        if (!error && data) {
          setCheckIns((prev) => ({
            ...prev,
            [meetingId]: data.map((row: any) => ({
              first_name: row.attendee?.first_name ?? "",
              last_name: row.attendee?.last_name ?? "",
              email: row.attendee?.email ?? "",
              grad_year: row.attendee?.grad_year ?? "",
              checked_in_at: row.checked_in_at,
              answers: parseAnswers(row.answers),
            })),
          }));
        }
      } finally {
        setCheckInsLoading(false);
      }
    };
    fetchCheckIns();
  }, [attendanceMeetingId, checkIns, supabase]);

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
      start_time: meetingDraft.start_time,
      end_time: meetingDraft.end_time,
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
    // Attendance rows reference meetings, so deleting one with check-ins would
    // fail on the FK anyway -- say so up front instead of surfacing a raw error.
    if (m.attendance_count > 0) {
      setMeetingError(
        `"${m.title}" has ${m.attendance_count} check-in(s). Close it instead of deleting to keep the attendance record.`,
      );
      return;
    }
    if (!confirm(`Delete "${m.title}"? This cannot be undone.`)) return;

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

  // One column per form question, appended after the fixed attendee columns.
  // See lib/attendance-csv.ts -- shared with the meeting editor's Responses tab
  // so both produce the same file.
  const downloadAttendanceCSV = () => {
    const meeting = meetings.find((m) => m.id === attendanceMeetingId);
    const rows = checkIns[attendanceMeetingId ?? ""];
    if (!meeting || !rows) return;
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
      .then(({ error }) => {
        if (error) console.error("Failed to log attendance export:", error);
      });
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

  const nextMeeting = upcomingMeetings[0];
  const totalCheckIns = meetings.reduce((sum, m) => sum + m.attendance_count, 0);
  const officers = members.filter((m) => m.role?.toLowerCase() !== "member");

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

  const userInitials = initials(
    user?.fullName || user?.primaryEmailAddress?.emailAddress || "?"
  );

  if (!isLoaded || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <div className="text-xl text-slate-500">Loading...</div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-[14px] border border-slate-200 bg-white p-8 text-center">
          <h1 className="mb-2 text-2xl font-extrabold text-slate-900">Admin</h1>
          <p className="text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  const activeLabel = TABS.find((t) => t.key === activeTab)?.label;

  return (
    <div className="flex min-h-dvh bg-slate-50 text-slate-900">
      {/* Backdrop for the mobile drawer. Hidden at lg, where the sidebar is
          permanently docked. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — painted with the org's brand colors. Off-canvas drawer below
          lg, static column at lg and up. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-none flex-col gap-1 overflow-y-auto bg-brand-background p-4 pt-6 text-white transition-transform duration-200 lg:static lg:z-auto lg:w-60 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <img
            src={branding.logo.crest}
            alt={`${branding.name || organization.name} logo`}
            className="h-9 w-9 flex-none rounded-[10px] bg-white/10 object-contain p-1"
          />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[15px] font-extrabold tracking-[0.2px]">
              {branding.name || organization.name}
            </div>
            <div className="text-[11px] font-medium text-white/70">
              Admin Console
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="ml-auto cursor-pointer rounded-lg p-1.5 text-white/70 hover:bg-white/10 lg:hidden"
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
              className={`flex cursor-pointer items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-left text-sm font-semibold transition-all ${
                active
                  ? "bg-brand-background-secondary text-white"
                  : "text-white/70 hover:bg-white/10"
              }`}
            >
              <span
                className={`h-2 w-2 flex-none rounded-full ${
                  active ? "bg-brand-action" : "bg-white/30"
                }`}
              />
              {tab.label}
            </button>
          );
        })}

        {/* The way out. OrgNav deliberately doesn't render on this route (it
            would collide with this sidebar + the light top bar), so without
            this the admin console is a dead end. */}
        <Link
          href={`/${orgSlug}`}
          className="mt-auto flex items-center gap-2.5 rounded-[10px] border-t border-white/10 px-3.5 pt-4 pb-2.5 text-sm font-semibold text-white/60 transition-colors hover:text-white"
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
          className="flex items-center gap-2.5 rounded-[10px] px-3.5 py-2 text-xs font-semibold text-white/45 transition-colors hover:text-white/80"
        >
          <span className="w-4 flex-none" aria-hidden="true" />
          All clubs
        </Link>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 flex-none items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6 lg:h-18 lg:px-9">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              className="-ml-1 cursor-pointer rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
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
            <div className="truncate text-lg font-extrabold sm:text-xl">
              {activeLabel}
            </div>
          </div>
          <div className="flex flex-none items-center gap-3.5">
            {/* The full date is noise on a phone -- the avatar is what matters. */}
            <span className="hidden text-[13px] font-medium text-slate-500 lg:inline">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-action text-[13px] font-bold text-white">
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
                    value: String(members.length),
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
                    className="rounded-[14px] border border-slate-200 bg-white p-5"
                  >
                    <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      {stat.label}
                    </div>
                    <div className="mt-2 text-3xl font-extrabold">
                      {stat.value}
                    </div>
                    <div className="mt-1.5 text-xs font-semibold text-brand-primary">
                      {stat.sub}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
                <div className="rounded-[14px] border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="mb-4 text-base font-bold">Next Meeting</div>
                  {nextMeeting ? (
                    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
                      <div className="min-w-0">
                        <div className="text-lg font-extrabold wrap-break-word">
                          {nextMeeting.title}
                        </div>
                        <div className="mt-1.5 text-sm font-medium text-slate-500">
                          {fmtDate(nextMeeting.start_time)} ·{" "}
                          {fmtTime(nextMeeting.start_time)} –{" "}
                          {fmtTime(nextMeeting.end_time)}
                        </div>
                        <span
                          className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold ${
                            nextMeeting.status
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {nextMeeting.status ? "Active" : "Closed"}
                        </span>
                      </div>
                      <button
                        onClick={() => setActiveTab("meetings")}
                        className="flex-none cursor-pointer rounded-[9px] border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold text-brand-background transition-all hover:bg-slate-50"
                      >
                        View all
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">
                      No upcoming meetings scheduled.
                    </div>
                  )}
                </div>

                <div className="rounded-[14px] border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="mb-4 text-base font-bold">Officers</div>
                  {officers.length > 0 ? (
                    <div className="flex flex-col gap-3.5">
                      {officers.map((o) => (
                        <div
                          key={o.user_id}
                          className="flex items-center gap-3"
                        >
                          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-primary/10 text-xs font-bold text-brand-primary">
                            {initials(`${o.first_name} ${o.last_name}`)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold">
                              {o.first_name} {o.last_name}
                            </div>
                            <div className="text-xs font-medium text-slate-500">
                              {o.role}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">
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
                <div className="flex gap-1.5 rounded-[10px] bg-slate-100 p-1">
                  {(["upcoming", "past", "all"] as MeetingFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setMeetingFilter(f)}
                      className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-[13px] font-bold capitalize transition-all sm:flex-none sm:px-4 ${
                        meetingFilter === f
                          ? "bg-white text-brand-background shadow-sm"
                          : "text-slate-500"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <button
                  onClick={openCreateMeeting}
                  className="w-full cursor-pointer rounded-[9px] bg-brand-action px-4.5 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 sm:w-auto"
                >
                  + New Meeting
                </button>
              </div>

              <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
                {/* Column headers only make sense once the rows are actually a
                    grid -- below lg each row renders as a stacked card. */}
                <div className="hidden grid-cols-[2fr_1.3fr_1.3fr_1fr_100px_170px] gap-4 border-b border-slate-200 px-5 py-3.5 text-xs font-bold tracking-wide text-slate-500 uppercase lg:grid">
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
                  <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
                    {meetingError}
                  </div>
                )}
                {meetingsLoading ? (
                  <div className="p-10 text-center text-sm text-slate-500">
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
                      className="flex cursor-pointer flex-col gap-2 border-b border-slate-100 px-4 py-4 text-sm transition-all last:border-b-0 hover:bg-slate-50 sm:px-5 lg:grid lg:grid-cols-[2fr_1.3fr_1.3fr_1fr_100px_170px] lg:items-center lg:gap-4"
                    >
                      <div className="font-bold wrap-break-word">
                        {m.title}
                        {m.is_geo_locked && (
                          <span
                            title={`Geo-locked to ${m.radius_meters ?? 200}m`}
                            className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
                          >
                            📍 {m.radius_meters ?? 200}m
                          </span>
                        )}
                        {m.form_schema.length > 0 && (
                          <span
                            title={`${m.form_schema.length} check-in question(s)`}
                            className="ml-2 inline-block rounded bg-brand-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-brand-primary"
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
                            className="ml-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600"
                          >
                            🔒 Password
                          </span>
                        )}
                      </div>
                      {/* The stacked layout has no column headers, so each
                          value carries its own label below lg. */}
                      <div className="font-medium text-slate-600">
                        <span className="text-slate-400 lg:hidden">Start: </span>
                        {fmtDate(m.start_time)}, {fmtTime(m.start_time)}
                      </div>
                      <div className="font-medium text-slate-600">
                        <span className="text-slate-400 lg:hidden">End: </span>
                        {fmtDate(m.end_time)}, {fmtTime(m.end_time)}
                      </div>
                      <div className="font-bold">
                        {m.attendance_count}{" "}
                        <span className="font-medium text-slate-500">
                          checked in
                        </span>
                      </div>
                      <div>
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            m.status
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-500"
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
                          className="cursor-pointer rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
                        >
                          {m.status ? "Close" : "Open"}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditMeeting(m);
                          }}
                          className="cursor-pointer rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMeeting(m);
                          }}
                          disabled={deletingMeetingId === m.id}
                          className="cursor-pointer rounded-md border border-red-200 px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingMeetingId === m.id ? "..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-10 text-center text-sm text-slate-500">
                    No meetings in this view.
                    {meetings.length > 0 && meetingFilter !== "all" && (
                      <>
                        {" "}
                        <button
                          onClick={() => setMeetingFilter("all")}
                          className="cursor-pointer font-bold text-brand-action underline"
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
                    className="text-sm font-bold text-slate-500"
                  >
                    Meeting:
                  </label>
                  <select
                    id="attendance-meeting"
                    value={attendanceMeetingId ?? ""}
                    onChange={(e) => setAttendanceMeetingId(e.target.value)}
                    className="w-full rounded-[9px] border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold sm:w-auto sm:min-w-70"
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
                  disabled={!selectedCheckIns?.length}
                  className="w-full cursor-pointer rounded-[9px] bg-brand-background px-4.5 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 sm:w-auto"
                >
                  ↓ Download attendance (.csv)
                </button>
              </div>

              {selectedMeeting ? (
                <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
                  <div className="flex flex-col gap-1 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="min-w-0">
                      <div className="text-base font-extrabold wrap-break-word">
                        {selectedMeeting.title}
                      </div>
                      <div className="mt-0.5 text-xs font-semibold text-slate-500">
                        {fmtDate(selectedMeeting.start_time)} ·{" "}
                        {fmtTime(selectedMeeting.start_time)}
                      </div>
                    </div>
                    <div className="flex-none text-[13px] font-bold text-brand-background">
                      {selectedMeeting.attendance_count} checked in
                    </div>
                  </div>
                  <div className="hidden grid-cols-[2fr_2fr_1fr_1.4fr] gap-4 border-b border-slate-200 px-5 py-3.5 text-xs font-bold tracking-wide text-slate-500 uppercase md:grid">
                    <div>Attendee</div>
                    <div>Email</div>
                    <div>Class</div>
                    <div>Checked In</div>
                  </div>
                  {checkInsLoading && !selectedCheckIns ? (
                    <div className="p-10 text-center text-sm text-slate-500">
                      Loading attendees...
                    </div>
                  ) : selectedCheckIns && selectedCheckIns.length > 0 ? (
                    selectedCheckIns.map((row, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col gap-1.5 border-b border-slate-100 px-4 py-3.5 text-sm last:border-b-0 sm:px-5 md:grid md:grid-cols-[2fr_2fr_1fr_1.4fr] md:items-center md:gap-4"
                      >
                        <div className="flex min-w-0 items-center gap-2.5 font-bold">
                          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-primary/10 text-[11px] font-bold text-brand-primary">
                            {initials(`${row.first_name} ${row.last_name}`)}
                          </div>
                          <span className="min-w-0 wrap-break-word">
                            {row.first_name} {row.last_name}
                          </span>
                        </div>
                        {/* Long addresses wrap on mobile rather than truncate --
                            a stacked card has the room, and a clipped email is
                            useless to an officer. */}
                        <div className="text-[13px] font-medium break-all text-slate-600 md:truncate md:break-normal">
                          {row.email}
                        </div>
                        <div className="font-medium text-slate-600">
                          {row.grad_year ? `Class of ${row.grad_year}` : "—"}
                        </div>
                        <div className="text-[13px] font-medium text-slate-600">
                          <span className="text-slate-400 md:hidden">
                            Checked in:{" "}
                          </span>
                          {new Date(row.checked_in_at).toLocaleString()}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-10 text-center text-sm text-slate-500">
                      No attendees for this meeting.
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-[14px] border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                  No meetings yet.
                </div>
              )}
            </>
          )}

          {/* MEMBERS */}
          {activeTab === "members" && (
            <MembersTab
              orgId={organization.id}
              membershipRole={membershipRole}
              isGlobalAdmin={isGlobalAdmin}
              meetings={meetings}
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-4"
          onClick={() => setShowMeetingModal(false)}
        >
          <form
            onSubmit={handleSaveMeeting}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:max-h-[90dvh] sm:w-120 sm:max-w-[92vw] sm:rounded-2xl sm:p-7"
          >
            <div className="mb-1 text-lg font-extrabold">New Meeting</div>
            <p className="mb-4 text-xs text-slate-500">
              You&apos;ll add check-in questions on the next screen.
            </p>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">
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
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">
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
                  className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">
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
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">
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
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>
              {/* Open for check-in. Guests only ever see status = true
                  meetings (meetings_anon_read_active), so this is the switch
                  that makes a meeting checkin-able. */}
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3">
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
                  <span className="block text-xs text-slate-500">
                    Members and guests can check in while this is on.
                  </span>
                </span>
              </label>

              <div className="rounded-lg border border-slate-200 p-3">
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
                    <span className="block text-xs text-slate-500">
                      Check-in is refused beyond the radius below.
                    </span>
                  </span>
                </label>

                {meetingDraft.is_geo_locked && (
                  <div className="mt-3 flex flex-col gap-2.5 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={useCurrentLocation}
                      disabled={locating}
                      className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {locating ? "Getting location..." : "📍 Use current location"}
                    </button>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-slate-500">
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
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-slate-500">
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
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-slate-500">
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
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        200m suits a lecture hall. Phone GPS is only accurate to
                        roughly 10–50m indoors, so avoid going much tighter.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3">
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
                  <span className="block text-xs text-slate-500">
                    Hidden from regular members entirely -- doesn&apos;t appear
                    on their check-in page or count toward their attendance.
                  </span>
                </span>
              </label>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">
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
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Required from everyone checking in, guest or member.
                </p>
              </div>

              {meetingError && (
                <p className="text-sm text-red-600">{meetingError}</p>
              )}
            </div>
            {/* Primary action first in the DOM but visually last on desktop --
                on mobile the stacked order puts Save at the top of the thumb's
                reach. */}
            <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowMeetingModal(false)}
                className="cursor-pointer rounded-[9px] border border-slate-200 bg-white px-4.5 py-2.5 text-[13px] font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingMeeting}
                className="cursor-pointer rounded-[9px] bg-brand-action px-4.5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
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

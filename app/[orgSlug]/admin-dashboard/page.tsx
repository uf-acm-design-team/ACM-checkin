"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { createClient } from "../../utils/supabase/client";
import { useBranding } from "@/app/components/BrandingProvider";

interface Organization {
  id: string;
  name: string;
  slug: string;
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
}

// Blank form state, shared by the create and edit flows.
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
};
type MeetingDraft = typeof EMPTY_MEETING_DRAFT;

interface CheckIn {
  first_name: string;
  last_name: string;
  email: string;
  grad_year: string;
  checked_in_at: string;
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
  { key: "orgs", label: "Orgs" },
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

  // This user's role in THIS org (from memberships). Null until resolved.
  const [membershipRole, setMembershipRole] = useState<string | null>(null);
  // Global admin flag from attendees.admin -- gates the Orgs tab only.
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);

  // Meetings
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [meetingFilter, setMeetingFilter] = useState<MeetingFilter>("upcoming");
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingDraft, setMeetingDraft] =
    useState<MeetingDraft>(EMPTY_MEETING_DRAFT);
  // Non-null when the modal is editing an existing meeting rather than creating.
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
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

  // Members
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [memberSearch, setMemberSearch] = useState("");

  // Orgs
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [orgDraft, setOrgDraft] = useState({ name: "", slug: "" });
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.push("/");
    }
  }, [isLoaded, user, router]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) return; // the effect above handles the signed-out redirect

    const fetchOrganization = async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, slug")
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
        setError("You don't have access to this organization");
        setLoading(false);
        return;
      }

      setMembershipRole(membership.role ?? null);
      setOrganization(data);
      setLoading(false);
    };

    fetchOrganization();
  }, [orgSlug, supabase, isLoaded, user]);

  // Whether this user may create organizations. Gated on attendees.admin --
  // a global flag, distinct from the per-org memberships.role above.
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
          return;
        }
        setIsGlobalAdmin(Boolean(data?.admin));
      });
  }, [isLoaded, user, supabase]);

  const fetchMeetings = useCallback(async () => {
    if (!organization) return;
    setMeetingsLoading(true);
    try {
      const { data, error } = await supabase
        .from("meetings")
        .select(
          "id, title, start_time, end_time, status, description, is_geo_locked, latitude, longitude, radius_meters",
        )
        .eq("org_id", organization.id)
        .order("start_time", { ascending: false });

      if (error) {
        console.error("Error fetching meetings:", error);
        return;
      }

      const withCounts = await Promise.all(
        (data || []).map(async (meeting) => {
          const { count } = await supabase
            .from("attendance")
            .select("*", { count: "exact", head: true })
            .eq("meeting_id", meeting.id);
          return { ...meeting, attendance_count: count || 0 };
        })
      );
      setMeetings(withCounts);
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

  const fetchOrgs = useCallback(async () => {
    setOrgsLoading(true);
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, slug")
        .order("name");
      if (error) {
        console.error("Error fetching organizations:", error);
      } else {
        setOrgs(data || []);
      }
    } finally {
      setOrgsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!organization) return;
    fetchMeetings();
    fetchMembers();
    fetchOrgs();
  }, [organization, fetchMeetings, fetchMembers, fetchOrgs]);

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
            "checked_in_at, attendee:attendee_id(first_name, last_name, email, grad_year)"
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
    setEditingMeetingId(null);
    setMeetingDraft(EMPTY_MEETING_DRAFT);
    setMeetingError(null);
    setShowMeetingModal(true);
  };

  const openEditMeeting = (m: Meeting) => {
    setEditingMeetingId(m.id);
    setMeetingError(null);
    setMeetingDraft({
      title: m.title,
      description: m.description ?? "",
      // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm". start_time is a
      // timestamp WITHOUT time zone, so slicing avoids a Date round-trip that
      // would shift the value by the viewer's UTC offset.
      start_time: m.start_time ? m.start_time.slice(0, 16) : "",
      end_time: m.end_time ? m.end_time.slice(0, 16) : "",
      status: m.status,
      is_geo_locked: m.is_geo_locked,
      latitude: m.latitude?.toString() ?? "",
      longitude: m.longitude?.toString() ?? "",
      radius_meters: (m.radius_meters ?? 200).toString(),
    });
    setShowMeetingModal(true);
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
    };

    try {
      const { error } = editingMeetingId
        ? await supabase
            .from("meetings")
            .update(payload)
            .eq("id", editingMeetingId)
        : await supabase
            .from("meetings")
            .insert({ ...payload, org_id: organization.id, created_by: user.id });

      if (error) {
        setMeetingError(error.message);
        return;
      }

      setShowMeetingModal(false);
      setEditingMeetingId(null);
      setMeetingDraft(EMPTY_MEETING_DRAFT);

      // Make sure the meeting just saved is actually visible. Creating one that
      // already ended (or backdating an edit) would otherwise drop it out of the
      // default "Upcoming" view, which reads as "the save didn't work".
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
    const { error } = await supabase
      .from("meetings")
      .update({ status: !m.status })
      .eq("id", m.id);
    if (error) {
      setMeetingError(error.message);
      return;
    }
    fetchMeetings();
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

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreatingOrg(true);
    setOrgError(null);
    try {
      // Only attendees flagged as admins may create organizations.
      const { data: admin, error: adminError } = await supabase
        .from("attendees")
        .select("admin")
        .eq("user_id", user.id)
        .maybeSingle();

      if (adminError || !admin?.admin) {
        setOrgError("You are not authorized to create organizations.");
        return;
      }

      const { error: orgInsertError } = await supabase
        .from("organizations")
        .insert({ name: orgDraft.name, slug: orgDraft.slug });

      if (orgInsertError) {
        setOrgError(orgInsertError.message);
      } else {
        setShowOrgModal(false);
        setOrgDraft({ name: "", slug: "" });
        fetchOrgs();
      }
    } catch {
      setOrgError("Error verifying admin");
    } finally {
      setCreatingOrg(false);
    }
  };

  const downloadAttendanceCSV = () => {
    const meeting = meetings.find((m) => m.id === attendanceMeetingId);
    const rows = checkIns[attendanceMeetingId ?? ""];
    if (!meeting || !rows) return;
    const csvRows = [["Name", "Email", "Grad Year", "Checked In At"]];
    rows.forEach((r) => {
      csvRows.push([
        `${r.first_name} ${r.last_name}`,
        r.email,
        r.grad_year,
        new Date(r.checked_in_at).toLocaleString(),
      ]);
    });
    const csv = csvRows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meeting.title}_attendance`.replace(/\s+/g, "_") + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  // The Orgs tab creates organizations, which is a global-admin action rather
  // than a per-org one -- hide it unless attendees.admin is set. RLS enforces
  // the same rule server-side (orgs_admin_insert), so this only prevents
  // showing a control that would fail.
  const visibleTabs = useMemo(
    () => TABS.filter((tab) => tab.key !== "orgs" || isGlobalAdmin),
    [isGlobalAdmin]
  );

  // If the active tab is no longer visible (admin flag resolved to false after
  // the tab was already selected), fall back to overview.
  useEffect(() => {
    if (!visibleTabs.some((t) => t.key === activeTab)) {
      setActiveTab("overview");
    }
  }, [visibleTabs, activeTab]);

  const search = memberSearch.trim().toLowerCase();
  const filteredMembers = members.filter(
    (m) =>
      !search ||
      `${m.first_name} ${m.last_name}`.toLowerCase().includes(search) ||
      m.email.toLowerCase().includes(search) ||
      m.role?.toLowerCase().includes(search)
  );

  const selectedMeeting = meetings.find((m) => m.id === attendanceMeetingId);
  const selectedCheckIns = checkIns[attendanceMeetingId ?? ""];

  const userInitials = initials(
    user?.fullName || user?.primaryEmailAddress?.emailAddress || "?"
  );

  if (!isLoaded || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-xl text-slate-500">Loading...</div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-[14px] border border-slate-200 bg-white p-8 text-center">
          <h1 className="mb-2 text-2xl font-extrabold text-slate-900">Admin</h1>
          <p className="text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  const activeLabel = TABS.find((t) => t.key === activeTab)?.label;

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Sidebar — painted with the org's brand colors */}
      <aside className="flex w-60 flex-none flex-col gap-1 bg-brand-background p-4 pt-6 text-white">
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <img
            src={branding.logo.crest}
            alt={`${branding.name || organization.name} logo`}
            className="h-9 w-9 rounded-[10px] bg-white/10 object-contain p-1"
          />
          <div className="leading-tight">
            <div className="text-[15px] font-extrabold tracking-[0.2px]">
              {branding.name || organization.name}
            </div>
            <div className="text-[11px] font-medium text-white/70">
              Admin Console
            </div>
          </div>
        </div>

        {visibleTabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
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
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-[72px] flex-none items-center justify-between border-b border-slate-200 bg-white px-9">
          <div className="text-xl font-extrabold">{activeLabel}</div>
          <div className="flex items-center gap-3.5">
            <span className="text-[13px] font-medium text-slate-500">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-action text-[13px] font-bold text-white">
              {userInitials}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-8">
          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <>
              <div className="mb-7 grid grid-cols-2 gap-5 xl:grid-cols-4">
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
                <div className="rounded-[14px] border border-slate-200 bg-white p-6">
                  <div className="mb-4 text-base font-bold">Next Meeting</div>
                  {nextMeeting ? (
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-lg font-extrabold">
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

                <div className="rounded-[14px] border border-slate-200 bg-white p-6">
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
              <div className="mb-5 flex items-center justify-between gap-4">
                <div className="flex gap-1.5 rounded-[10px] bg-slate-100 p-1">
                  {(["upcoming", "past", "all"] as MeetingFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setMeetingFilter(f)}
                      className={`cursor-pointer rounded-lg px-4 py-2 text-[13px] font-bold capitalize transition-all ${
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
                  className="cursor-pointer rounded-[9px] bg-brand-action px-4.5 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90"
                >
                  + New Meeting
                </button>
              </div>

              <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
                <div className="grid grid-cols-[2fr_1.3fr_1.3fr_1fr_100px_170px] gap-4 border-b border-slate-200 px-5 py-3.5 text-xs font-bold tracking-wide text-slate-500 uppercase">
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
                      className="grid cursor-pointer grid-cols-[2fr_1.3fr_1.3fr_1fr_100px_170px] items-center gap-4 border-b border-slate-100 px-5 py-4 text-sm transition-all last:border-b-0 hover:bg-slate-50"
                    >
                      <div className="font-bold">
                        {m.title}
                        {m.is_geo_locked && (
                          <span
                            title={`Geo-locked to ${m.radius_meters ?? 200}m`}
                            className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
                          >
                            📍 {m.radius_meters ?? 200}m
                          </span>
                        )}
                      </div>
                      <div className="font-medium text-slate-600">
                        {fmtDate(m.start_time)}, {fmtTime(m.start_time)}
                      </div>
                      <div className="font-medium text-slate-600">
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
                          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
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
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMeetingStatus(m);
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
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-bold text-slate-500">
                    Meeting:
                  </label>
                  <select
                    value={attendanceMeetingId ?? ""}
                    onChange={(e) => setAttendanceMeetingId(e.target.value)}
                    className="min-w-[280px] rounded-[9px] border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold"
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
                  className="cursor-pointer rounded-[9px] bg-brand-background px-4.5 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                >
                  ↓ Download attendance (.csv)
                </button>
              </div>

              {selectedMeeting ? (
                <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                      <div className="text-base font-extrabold">
                        {selectedMeeting.title}
                      </div>
                      <div className="mt-0.5 text-xs font-semibold text-slate-500">
                        {fmtDate(selectedMeeting.start_time)} ·{" "}
                        {fmtTime(selectedMeeting.start_time)}
                      </div>
                    </div>
                    <div className="text-[13px] font-bold text-brand-background">
                      {selectedMeeting.attendance_count} checked in
                    </div>
                  </div>
                  <div className="grid grid-cols-[2fr_2fr_1fr_1.4fr] gap-4 border-b border-slate-200 px-5 py-3.5 text-xs font-bold tracking-wide text-slate-500 uppercase">
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
                        className="grid grid-cols-[2fr_2fr_1fr_1.4fr] items-center gap-4 border-b border-slate-100 px-5 py-3.5 text-sm last:border-b-0"
                      >
                        <div className="flex items-center gap-2.5 font-bold">
                          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-primary/10 text-[11px] font-bold text-brand-primary">
                            {initials(`${row.first_name} ${row.last_name}`)}
                          </div>
                          {row.first_name} {row.last_name}
                        </div>
                        <div className="truncate text-[13px] font-medium text-slate-600">
                          {row.email}
                        </div>
                        <div className="font-medium text-slate-600">
                          {row.grad_year ? `Class of ${row.grad_year}` : "—"}
                        </div>
                        <div className="font-medium text-slate-600">
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
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <input
                  type="text"
                  placeholder="Search members..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="min-w-[260px] rounded-[9px] border border-slate-200 bg-white px-4 py-2.5 text-sm"
                />
                <div className="text-[13px] font-semibold text-slate-500">
                  {members.length} member{members.length === 1 ? "" : "s"}
                </div>
              </div>

              <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
                <div className="grid grid-cols-[1.8fr_2fr_1.2fr_1.3fr] gap-4 border-b border-slate-200 px-5 py-3.5 text-xs font-bold tracking-wide text-slate-500 uppercase">
                  <div>Name</div>
                  <div>Contact</div>
                  <div>Role</div>
                  <div>Check-Ins</div>
                </div>
                {membersLoading ? (
                  <div className="p-10 text-center text-sm text-slate-500">
                    Loading members...
                  </div>
                ) : filteredMembers.length > 0 ? (
                  filteredMembers.map((mem) => {
                    const rate =
                      pastMeetings.length > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (mem.attendance_count / pastMeetings.length) * 100
                            )
                          )
                        : 0;
                    return (
                      <div
                        key={mem.user_id}
                        className="grid grid-cols-[1.8fr_2fr_1.2fr_1.3fr] items-center gap-4 border-b border-slate-100 px-5 py-3.5 text-sm last:border-b-0"
                      >
                        <div className="flex items-center gap-2.5 font-bold">
                          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-primary/10 text-[11px] font-bold text-brand-primary">
                            {initials(`${mem.first_name} ${mem.last_name}`)}
                          </div>
                          {mem.first_name} {mem.last_name}
                        </div>
                        <div className="truncate text-[13px] font-medium text-slate-600">
                          {mem.email}
                        </div>
                        <div>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 capitalize">
                            {mem.role || "member"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-[60px] overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full bg-brand-action"
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold">
                            {mem.attendance_count}
                          </span>
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
            </>
          )}

          {/* ORGS */}
          {activeTab === "orgs" && isGlobalAdmin && (
            <>
              <div className="mb-5 flex items-center justify-between gap-4">
                <div className="text-sm font-semibold text-slate-500">
                  All organizations on the platform.
                </div>
                <button
                  onClick={() => {
                    setOrgError(null);
                    setShowOrgModal(true);
                  }}
                  className="cursor-pointer rounded-[9px] bg-brand-action px-4.5 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90"
                >
                  + New Org
                </button>
              </div>

              <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
                <div className="grid grid-cols-[2.6fr_1.6fr_120px] gap-4 border-b border-slate-200 px-5 py-3.5 text-xs font-bold tracking-wide text-slate-500 uppercase">
                  <div>Organization</div>
                  <div>Slug</div>
                  <div></div>
                </div>
                {orgsLoading ? (
                  <div className="p-10 text-center text-sm text-slate-500">
                    Loading organizations...
                  </div>
                ) : orgs.length > 0 ? (
                  orgs.map((org) => (
                    <div
                      key={org.id}
                      className="grid grid-cols-[2.6fr_1.6fr_120px] items-center gap-4 border-b border-slate-100 px-5 py-4 text-sm last:border-b-0"
                    >
                      <div className="font-bold">{org.name}</div>
                      <div className="font-semibold text-slate-600">
                        @{org.slug}
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={() =>
                            router.push(`/${org.slug}/admin-dashboard`)
                          }
                          className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-brand-background transition-all hover:bg-slate-50"
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-10 text-center text-sm text-slate-500">
                    No organizations yet.
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* MEETING MODAL -- create and edit share this form */}
      {showMeetingModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          onClick={() => setShowMeetingModal(false)}
        >
          <form
            onSubmit={handleSaveMeeting}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-[480px] max-w-[92vw] overflow-y-auto rounded-2xl bg-white p-7"
          >
            <div className="mb-4 text-lg font-extrabold">
              {editingMeetingId ? "Edit Meeting" : "New Meeting"}
            </div>
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

              {meetingError && (
                <p className="text-sm text-red-600">{meetingError}</p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2.5">
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
                {creatingMeeting
                  ? "Saving..."
                  : editingMeetingId
                    ? "Save Changes"
                    : "Create Meeting"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* NEW ORG MODAL */}
      {showOrgModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45"
          onClick={() => setShowOrgModal(false)}
        >
          <form
            onSubmit={handleCreateOrg}
            onClick={(e) => e.stopPropagation()}
            className="w-[440px] max-w-[92vw] rounded-2xl bg-white p-7"
          >
            <div className="mb-4 text-lg font-extrabold">New Organization</div>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">
                  Organization Name
                </label>
                <input
                  type="text"
                  required
                  value={orgDraft.name}
                  onChange={(e) =>
                    setOrgDraft({ ...orgDraft, name: e.target.value })
                  }
                  placeholder="Organization Name"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">
                  Slug
                </label>
                <input
                  type="text"
                  required
                  value={orgDraft.slug}
                  onChange={(e) =>
                    setOrgDraft({ ...orgDraft, slug: e.target.value })
                  }
                  placeholder="e.g. acm"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>
              {orgError && <p className="text-sm text-red-600">{orgError}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowOrgModal(false)}
                className="cursor-pointer rounded-[9px] border border-slate-200 bg-white px-4.5 py-2.5 text-[13px] font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingOrg}
                className="cursor-pointer rounded-[9px] bg-brand-action px-4.5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {creatingOrg ? "Creating..." : "Create Organization"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

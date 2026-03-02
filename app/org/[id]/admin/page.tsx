"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";

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
  created_at: string;
  attendance_count: number;
  attendees?: Attendee[];
}

interface Attendee {
  first_name: string;
  last_name: string;
  email: string;
  grad_year: string;
  checked_in_at: string;
}

export default function AdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const [user, setUser] = useState<any>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"create" | "meetings">("meetings");

  // Create meeting form
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);

  // Past meetings
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);
  const [attendeesLoading, setAttendeesLoading] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      if (!user) {
        router.push("/");
      }
    };
    getUser();
  }, [supabase.auth, router]);

  useEffect(() => {
    const fetchOrganization = async () => {
      try {
        const { data, error } = await supabase
          .from("organizations")
          .select("id, name, slug")
          .eq("slug", id)
          .single();

        if (error) {
          setError("Organization not found");
        } else {
          setOrganization(data);
        }
      } catch (err) {
        setError("Organization not found");
      } finally {
        setLoading(false);
      }
    };

    fetchOrganization();
  }, [id, supabase]);

  useEffect(() => {
    if (!organization || activeTab !== "meetings") return;
    fetchMeetings();
  }, [organization, activeTab]);

  const fetchMeetings = async () => {
    if (!organization) return;
    setMeetingsLoading(true);
    try {
      const { data: meetingsData, error } = await supabase
        .from("meetings")
        .select("id, title, start_time, end_time, status, created_at")
        .eq("org_id", organization.id)
        .order("start_time", { ascending: false });

      if (error) {
        console.error("Error fetching meetings:", error);
        return;
      }

      const meetingsWithCounts = await Promise.all(
        (meetingsData || []).map(async (meeting) => {
          const { count } = await supabase
            .from("attendance")
            .select("*", { count: "exact", head: true })
            .eq("meeting_id", meeting.id);
          return { ...meeting, attendance_count: count || 0 };
        })
      );

      setMeetings(meetingsWithCounts);
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setMeetingsLoading(false);
    }
  };

  const toggleAttendees = async (meetingId: string) => {
    if (expandedMeeting === meetingId) {
      setExpandedMeeting(null);
      return;
    }

    setAttendeesLoading(meetingId);
    try {
      const { data, error } = await supabase
        .from("attendance")
        .select(
          "checked_in_at, attendee:attendee_id(first_name, last_name, email, grad_year)"
        )
        .eq("meeting_id", meetingId);

      if (!error && data) {
        setMeetings((prev) =>
          prev.map((m) =>
            m.id === meetingId
              ? {
                  ...m,
                  attendees: data.map((a: any) => ({
                    first_name: a.attendee?.first_name,
                    last_name: a.attendee?.last_name,
                    email: a.attendee?.email,
                    grad_year: a.attendee?.grad_year,
                    checked_in_at: a.checked_in_at,
                  })),
                }
              : m
          )
        );
        setExpandedMeeting(meetingId);
      }
    } catch (err) {
      console.error("Error fetching attendees:", err);
    } finally {
      setAttendeesLoading(null);
    }
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !user) return;

    setCreating(true);
    setCreateError(null);
    setCreateSuccess(false);

    try {
      const { error } = await supabase.from("meetings").insert({
        title,
        start_time: startTime,
        end_time: endTime,
        org_id: organization.id,
        created_by: user.id,
        status: true,
      });

      if (error) {
        setCreateError(error.message);
      } else {
        setCreateSuccess(true);
        setTitle("");
        setStartTime("");
        setEndTime("");
      }
    } catch (err) {
      setCreateError("Failed to create meeting");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">Admin</h1>
          <p className="text-white/90 text-lg">Powered by ACM</p>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 w-full max-w-2xl border border-white/20">
          <p className="text-white text-center text-xl">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="text-center mb-8">
        <h1 className="text-5xl font-bold text-white mb-2">
          {organization.name} Admin
        </h1>
        <p className="text-white/90 text-lg">Powered by ACM</p>
      </div>

      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 w-full max-w-2xl border border-white/20">
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("meetings")}
            className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-all ${
              activeTab === "meetings"
                ? "bg-white/30 text-white"
                : "bg-white/10 text-white/60 hover:bg-white/20"
            }`}
          >
            Past Meetings
          </button>
          <button
            onClick={() => setActiveTab("create")}
            className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-all ${
              activeTab === "create"
                ? "bg-white/30 text-white"
                : "bg-white/10 text-white/60 hover:bg-white/20"
            }`}
          >
            Create Meeting
          </button>
        </div>

        {activeTab === "create" && (
          <form onSubmit={handleCreateMeeting} className="space-y-4">
            <div>
              <label className="block text-white/80 text-sm mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Meeting title"
                className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-white/50"
              />
            </div>
            <div>
              <label className="block text-white/80 text-sm mb-1">
                Start Time
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/50"
              />
            </div>
            <div>
              <label className="block text-white/80 text-sm mb-1">
                End Time
              </label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/50"
              />
            </div>
            {createError && (
              <p className="text-red-300 text-sm">{createError}</p>
            )}
            {createSuccess && (
              <p className="text-green-300 text-sm">
                Meeting created successfully!
              </p>
            )}
            <button
              type="submit"
              disabled={creating}
              className="w-full bg-white/20 hover:bg-white/30 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 border border-white/30 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Meeting"}
            </button>
          </form>
        )}

        {activeTab === "meetings" && (
          <div>
            {meetingsLoading ? (
              <p className="text-white/70">Loading meetings...</p>
            ) : meetings.length > 0 ? (
              <div className="space-y-3">
                {meetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="bg-white/10 rounded-lg border border-white/20"
                  >
                    <div
                      onClick={() => toggleAttendees(meeting.id)}
                      className="p-4 hover:bg-white/10 transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-semibold text-white">
                          {meeting.title}
                        </h4>
                        <span className="text-white/60 text-sm">
                          {meeting.attendance_count} attendees
                        </span>
                      </div>
                      <div className="text-white/60 text-sm mt-1 space-y-0.5">
                        <p>
                          Start: {new Date(meeting.start_time).toLocaleString()}
                        </p>
                        <p>
                          End: {new Date(meeting.end_time).toLocaleString()}
                        </p>
                      </div>
                      <div className="mt-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            meeting.status
                              ? "bg-green-500/30 text-green-200"
                              : "bg-white/10 text-white/50"
                          }`}
                        >
                          {meeting.status ? "Active" : "Closed"}
                        </span>
                      </div>
                    </div>

                    {attendeesLoading === meeting.id && (
                      <div className="px-4 pb-4">
                        <p className="text-white/60 text-sm">
                          Loading attendees...
                        </p>
                      </div>
                    )}

                    {expandedMeeting === meeting.id && meeting.attendees && (
                      <div className="px-4 pb-4 border-t border-white/10 pt-3">
                        {meeting.attendees.length > 0 ? (
                          <div className="space-y-2">
                            {meeting.attendees.map((attendee, idx) => (
                              <div
                                key={idx}
                                className="bg-white/5 rounded-lg p-3 text-sm"
                              >
                                <p className="text-white font-medium">
                                  {attendee.first_name} {attendee.last_name}
                                </p>
                                <p className="text-white/60">{attendee.email}</p>
                                <div className="flex gap-4 text-white/50 mt-1 flex-wrap">
                                  {attendee.grad_year && (
                                    <span>Class of {attendee.grad_year}</span>
                                  )}
                                  <span>
                                    Checked in:{" "}
                                    {new Date(
                                      attendee.checked_in_at
                                    ).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-white/60 text-sm">
                            No attendees for this meeting.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-white/70">No meetings found.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
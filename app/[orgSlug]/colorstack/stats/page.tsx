"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface MeetingSummary {
  id: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
}

interface AttendanceRecord {
  id: string;
  checked_in_at: string;
  source: string | null;
  meeting: MeetingSummary | null;
}

export default function ColorStackStatsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);

  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const attendedCount = useMemo(() => attendance.length, [attendance]);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push("/");
          return;
        }

        const { data: org, error: orgError } = await supabase
          .from("organizations")
          .select("id, name, slug")
          .eq("slug", "colorstack")
          .single();

        if (orgError || !org) {
          setError("Unable to load organization details.");
          return;
        }

        setOrganization(org);

        const { data: attendee, error: attendeeError } = await supabase
          .from("attendee")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (attendeeError || !attendee) {
          setError(
            "No attendee profile was found for this account. Please sign up or verify your account first."
          );
          return;
        }

        const { data: records, error: attendanceError } = await supabase
          .from("attendance")
          .select(`id, checked_in_at, source, meeting:meetings(id, title, start_time, end_time)`)
          .eq("attendee_id", attendee.id)
          .eq("org_id", org.id)
          .order("checked_in_at", { ascending: false });

        if (attendanceError) {
          setError(
            "Stats are only available for signed-in members. Please make sure you are signed in and have access."
          );
        } else {
          const normalized = (records || []).map((row: any) => ({
            id: row.id,
            checked_in_at: row.checked_in_at,
            source: row.source,
            meeting: Array.isArray(row.meeting) ? row.meeting[0] ?? null : row.meeting,
          })) as AttendanceRecord[];

          setAttendance(normalized);
        }
      } catch (err) {
        setError("A network error occurred. Please check your connection.");
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0b0f24] p-4">
        <div className="text-white text-xl">Loading stats...</div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0b0f24] p-4">
        <div className="bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl p-8 w-full max-w-lg border border-white/20 text-center">
          <h1 className="text-3xl font-bold text-[#18548f] mb-4">ColorStack Member Stats</h1>
          <p className="text-white/80 mb-5">{error ?? "Unable to load stats."}</p>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-[#f26f22] px-6 py-3 font-semibold text-white transition hover:bg-[#c65a1e]"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f24] p-4 text-white">
      <div className="mx-auto max-w-4xl rounded-[2rem] bg-white/10 p-8 shadow-2xl border border-white/10 backdrop-blur-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-[#f26f22] mb-2">
              Member-only Stats
            </p>
            <h1 className="text-4xl font-extrabold text-white">ColorStack Attendance History</h1>
            <p className="mt-2 text-sm text-white/70">
              Showing all meetings you have attended with ColorStack.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-3xl bg-[#18548f] px-5 py-4 text-center">
              <p className="text-sm uppercase text-white/70">Total attended</p>
              <p className="mt-2 text-3xl font-bold text-white">{attendedCount}</p>
            </div>
            <Link
              href="../"
              className="inline-flex items-center justify-center rounded-3xl border border-white/20 bg-white/10 px-5 py-4 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Back to ColorStack
            </Link>
          </div>
        </div>

        {attendance.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#0b0f24] p-8 text-center text-white/80">
            <p className="text-xl font-semibold text-white mb-3">No attendance records found.</p>
            <p>Attend a meeting while signed in to see your history here.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#091025]/80">
            <div className="grid grid-cols-[2fr,1fr,1fr] gap-4 border-b border-white/10 bg-[#0f172a]/90 px-6 py-4 text-sm uppercase tracking-[0.2em] text-white/60">
              <span>Meeting</span>
              <span>Date</span>
              <span>Source</span>
            </div>
            <div className="divide-y divide-white/10">
              {attendance.map((record) => (
                <div key={record.id} className="grid grid-cols-[2fr,1fr,1fr] gap-4 px-6 py-5 text-sm sm:text-base">
                  <div>
                    <p className="font-semibold text-white">
                      {record.meeting?.title ?? "Meeting"}
                    </p>
                    <p className="mt-1 text-white/60">
                      {record.meeting?.start_time
                        ? new Date(record.meeting.start_time).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "No date"}
                    </p>
                  </div>
                  <div className="text-white/80">
                    {record.checked_in_at
                      ? new Date(record.checked_in_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </div>
                  <div className="capitalize text-white/70">{record.source ?? "guest"}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

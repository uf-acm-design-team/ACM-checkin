"use client";

import React, { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { createClient } from "../../utils/supabase/client";
import { resolveAndUpdateMembershipStatus } from "../../[orgSlug]/checkin/actions";

const ORG_SLUG = "acm";
const UFL_EMAIL_REGEX = /^[^\s@]+@ufl\.edu$/;

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface ActiveMeeting {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
}

type Step = "email" | "profile";

export default function ACMCheckIn() {
  const { user, isLoaded } = useUser();
  const [userAttendee, setUserAttendee] = useState<any>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [activeMeeting, setActiveMeeting] = useState<ActiveMeeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gradYear, setGradYear] = useState("");

  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [checkInSuccess, setCheckInSuccess] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    if (!isLoaded) return;

    const init = async () => {
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("id, name, slug")
        .eq("slug", ORG_SLUG)
        .single();

      if (orgError || !org) {
        setError("Club does not exist");
        setLoading(false);
        return;
      }
      setOrganization(org);

      const { data: meetings } = await supabase
        .from("meetings")
        .select("id, title, start_time, end_time")
        .eq("org_id", org.id)
        .eq("status", true)
        .order("start_time", { ascending: true })
        .limit(1);

      setActiveMeeting(meetings?.[0] || null);

      if (user) {
        const { data: attendee } = await supabase
          .from("attendees")
          .select("id, first_name, last_name, email")
          .eq("user_id", user.id)
          .maybeSingle();
        setUserAttendee(attendee);
      }

      setLoading(false);
    };

    init();
  }, [isLoaded, user]);

  const performCheckIn = async (attendeeId: string, userId?: string) => {
    if (!organization || !activeMeeting) return;
    setCheckingIn(true);
    setCheckInError(null);

    try {
      const { data: existing } = await supabase
        .from("attendance")
        .select("id")
        .eq("meeting_id", activeMeeting.id)
        .eq("attendee_id", attendeeId)
        .maybeSingle();

      if (existing) {
        setCheckInError("You've already checked in to this meeting.");
        return;
      }

      const { error: attendanceError } = await supabase
        .from("attendance")
        .insert({
          attendee_id: attendeeId,
          org_id: organization.id,
          meeting_id: activeMeeting.id,
          source: userId ? "authenticated" : "guest",
        });

      if (attendanceError) {
        setCheckInError(attendanceError.message);
        return;
      }

      if (userId) {
        await resolveAndUpdateMembershipStatus(userId, attendeeId, organization.id, ORG_SLUG);
      }

      setCheckInSuccess(true);
    } catch {
      setCheckInError("Check-in failed. Please try again.");
    } finally {
      setCheckingIn(false);
    }
  };

  const handleAuthenticatedCheckIn = async () => {
    if (!user || !userAttendee || !organization) return;
    await performCheckIn(userAttendee.id, user.id);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckInError(null);

    if (!UFL_EMAIL_REGEX.test(email)) {
      setCheckInError("Please enter a valid UFL email address (@ufl.edu).");
      return;
    }

    setCheckingIn(true);

    try {
      const { data: attendee } = await supabase
        .from("attendees")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (attendee) {
        await performCheckIn(attendee.id);
      } else {
        setStep("profile");
        setCheckingIn(false);
      }
    } catch {
      setCheckInError("An error occurred. Please try again.");
      setCheckingIn(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckInError(null);
    setCheckingIn(true);

    try {
      const { data: newAttendee, error: createError } = await supabase
        .from("attendees")
        .insert({ email, first_name: firstName, last_name: lastName, grad_year: gradYear })
        .select("id")
        .single();

      if (createError || !newAttendee) {
        setCheckInError("Failed to create profile. Please try again.");
        return;
      }

      await performCheckIn(newAttendee.id);
    } catch {
      setCheckInError("An error occurred. Please try again.");
    } finally {
      setCheckingIn(false);
    }
  };

  const inputClass =
    "w-full rounded-2xl border border-slate-600 bg-slate-800/50 px-5 py-3 text-white placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

  const buttonActiveClass =
    "mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold uppercase tracking-wider text-white transition duration-200 hover:bg-blue-500";

  const buttonDisabledClass =
    "mt-6 w-full rounded-2xl bg-slate-700 px-4 py-3 text-sm font-bold uppercase tracking-wider text-slate-400 cursor-not-allowed";

  if (!isLoaded || loading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-purple-900 p-4">
        <p className="text-white/60">Loading...</p>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-purple-900 p-4">
        <div className="absolute top-8 left-8 flex items-center gap-3">
          <img src="/acm-logo.png" alt="ACM Logo" className="h-12 w-auto" />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/90 font-semibold">
              Association for Computing Machinery
            </p>
            <p className="text-sm font-bold text-white">ACM</p>
          </div>
        </div>
        <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-700/50 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl">
          <p className="text-center text-white">{error ?? "Something went wrong."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-purple-900 p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.1),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(147,51,234,0.1),transparent_40%)]" />

      <div className="absolute top-8 left-8 flex items-center gap-3">
        <img src="/acm-logo.png" alt="ACM Logo" className="h-12 w-auto" />
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/90 font-semibold">
            Association for Computing Machinery
          </p>
          <p className="text-sm font-bold text-white">ACM</p>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-700/50 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl">
        <h2 className="mb-2 text-center text-2xl font-bold text-white">ACM Attendance</h2>

        <div className="mb-8 text-center">
          {activeMeeting ? (
            <>
              <p className="text-xs uppercase tracking-widest text-white/50 mb-1">Active Meeting</p>
              <p className="text-white/80 font-semibold">{activeMeeting.title}</p>
            </>
          ) : (
            <p className="text-xs uppercase tracking-widest text-white/40">No Active Meeting</p>
          )}
        </div>

        {checkInSuccess ? (
          <div className="text-center py-4">
            <p className="text-green-400 text-xl font-semibold">You&apos;re checked in!</p>
            {activeMeeting && (
              <p className="text-white/50 mt-2 text-sm">See you at {activeMeeting.title}.</p>
            )}
          </div>
        ) : user ? (
          <div className="text-center">
            {userAttendee ? (
              <p className="text-white/60 mb-4 text-sm">
                Checking in as{" "}
                <span className="text-white font-semibold">
                  {userAttendee.first_name} {userAttendee.last_name}
                </span>
              </p>
            ) : (
              <p className="text-white/40 mb-4 text-sm">Attendee profile not found.</p>
            )}
            {checkInError && <p className="text-red-400 text-sm mb-3">{checkInError}</p>}
            <button
              onClick={handleAuthenticatedCheckIn}
              disabled={!activeMeeting || checkingIn || !userAttendee}
              className={activeMeeting && userAttendee ? buttonActiveClass : buttonDisabledClass}
            >
              {checkingIn ? "Checking in..." : activeMeeting ? "Check In" : "No Active Meeting"}
            </button>
          </div>
        ) : step === "email" ? (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {checkInError && <p className="text-red-400 text-sm">{checkInError}</p>}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your UFL Email"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={!activeMeeting || checkingIn}
              className={activeMeeting ? buttonActiveClass : buttonDisabledClass}
            >
              {checkingIn ? "Looking up..." : activeMeeting ? "Continue" : "No Active Meeting"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <p className="text-white/50 text-sm text-center">No profile found — fill in your info</p>
            {checkInError && <p className="text-red-400 text-sm">{checkInError}</p>}
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              placeholder="First Name"
              className={inputClass}
            />
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              placeholder="Last Name"
              className={inputClass}
            />
            <input
              type="email"
              value={email}
              readOnly
              className="w-full rounded-2xl border border-slate-700 bg-slate-800/30 px-5 py-3 text-white/40 cursor-not-allowed"
            />
            <input
              type="text"
              value={gradYear}
              onChange={(e) => setGradYear(e.target.value)}
              required
              placeholder="Grad Year (e.g., 2027)"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={checkingIn}
              className={buttonActiveClass}
            >
              {checkingIn ? "Saving..." : "Check In"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

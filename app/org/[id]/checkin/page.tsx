"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "../../../utils/supabase/client";

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

export default function CheckinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const [user, setUser] = useState<any>(null);
  const [userAttendee, setUserAttendee] = useState<any>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [activeMeeting, setActiveMeeting] = useState<ActiveMeeting | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Unauthenticated flow
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gradYear, setGradYear] = useState("");

  // Check-in state
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [checkInSuccess, setCheckInSuccess] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);

      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("id, name, slug")
        .eq("slug", id)
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
          .from("attendee")
          .select("id, first_name, last_name, email")
          .eq("user_id", user.id)
          .maybeSingle();
        setUserAttendee(attendee);
      }

      setLoading(false);
    };

    init();
  }, [id, supabase]);

  const performCheckIn = async (
    attendeeId: string,
    isNewMember: boolean,
    userId?: string
  ) => {
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

      if (userId && isNewMember) {
        await supabase.from("memberships").insert({
          user_id: userId,
          org_id: organization.id,
          role: "member",
          status: "active",
        });
      }

      setCheckInSuccess(true);
    } catch (err) {
      setCheckInError("Check-in failed. Please try again.");
    } finally {
      setCheckingIn(false);
    }
  };

  const handleAuthenticatedCheckIn = async () => {
    if (!user || !userAttendee || !organization) return;

    const { data: membership } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("org_id", organization.id)
      .maybeSingle();

    await performCheckIn(userAttendee.id, !membership, user.id);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckInError(null);
    setCheckingIn(true);

    try {
      const { data: attendee } = await supabase
        .from("attendee")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (attendee) {
        await performCheckIn(attendee.id, false);
      } else {
        setStep("profile");
        setCheckingIn(false);
      }
    } catch (err) {
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
        .from("attendee")
        .insert({ email, first_name: firstName, last_name: lastName, grad_year: gradYear })
        .select("id")
        .single();

      if (createError || !newAttendee) {
        setCheckInError("Failed to create profile. Please try again.");
        return;
      }

      await performCheckIn(newAttendee.id, false);
    } catch (err) {
      setCheckInError("An error occurred. Please try again.");
    } finally {
      setCheckingIn(false);
    }
  };

  const inputClass =
    "w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-white/50";

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
          <h1 className="text-5xl font-bold text-white mb-2">Club Check-In</h1>
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
          {organization.name} Check-In
        </h1>
        <p className="text-white/90 text-lg">Powered by ACM</p>
      </div>

      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 w-full max-w-2xl border border-white/20">
        {/* Meeting status header */}
        <div className="text-center mb-6">
          {activeMeeting ? (
            <>
              <p className="text-white/60 text-xs uppercase tracking-widest mb-1">
                Active Meeting
              </p>
              <h3 className="text-2xl font-bold text-white">
                {activeMeeting.title}
              </h3>
            </>
          ) : (
            <>
              <p className="text-white/60 text-xs uppercase tracking-widest mb-1">
                No Active Meeting
              </p>
              <h3 className="text-xl text-white/50">Check back later</h3>
            </>
          )}
        </div>

        {checkInSuccess ? (
          <div className="text-center py-4">
            <p className="text-green-300 text-xl font-semibold">
              You&apos;re checked in!
            </p>
            <p className="text-white/60 mt-2">
              See you at {activeMeeting?.title}.
            </p>
          </div>
        ) : user ? (
          /* Authenticated flow */
          <div className="text-center">
            {userAttendee ? (
              <p className="text-white/70 mb-4">
                Checking in as{" "}
                <span className="text-white font-semibold">
                  {userAttendee.first_name} {userAttendee.last_name}
                </span>
              </p>
            ) : (
              <p className="text-white/60 mb-4 text-sm">
                Your attendee profile could not be found.
              </p>
            )}
            {checkInError && (
              <p className="text-red-300 text-sm mb-3">{checkInError}</p>
            )}
            <button
              onClick={handleAuthenticatedCheckIn}
              disabled={!activeMeeting || checkingIn || !userAttendee}
              className={`w-full font-semibold py-3 px-4 rounded-lg transition-all duration-200 border ${
                activeMeeting && userAttendee
                  ? "bg-white/20 hover:bg-white/30 text-white border-white/30"
                  : "bg-white/5 text-white/30 border-white/10 cursor-not-allowed"
              }`}
            >
              {checkingIn
                ? "Checking in..."
                : activeMeeting
                ? "Check In"
                : "No Active Meeting"}
            </button>
          </div>
        ) : (
          /* Unauthenticated flow */
          <div>
            {step === "email" && (
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <p className="text-white/60 text-sm text-center">
                  Enter your email to check in
                </p>
                {checkInError && (
                  <p className="text-red-300 text-sm">{checkInError}</p>
                )}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="Email address"
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={!activeMeeting || checkingIn}
                  className={`w-full font-semibold py-3 px-4 rounded-lg transition-all duration-200 border ${
                    activeMeeting
                      ? "bg-white/20 hover:bg-white/30 text-white border-white/30"
                      : "bg-white/5 text-white/30 border-white/10 cursor-not-allowed"
                  }`}
                >
                  {checkingIn
                    ? "Looking up..."
                    : activeMeeting
                    ? "Continue"
                    : "No Active Meeting"}
                </button>
              </form>
            )}

            {step === "profile" && (
              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <p className="text-white/60 text-sm text-center">
                  No profile found — fill in your info to check in
                </p>
                {checkInError && (
                  <p className="text-red-300 text-sm">{checkInError}</p>
                )}
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
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white/50 cursor-not-allowed"
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
                  className="w-full bg-white/20 hover:bg-white/30 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 border border-white/30 disabled:opacity-50"
                >
                  {checkingIn ? "Saving..." : "Check In"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { memberCheckIn, resolveAndUpdateMembershipStatus } from "./actions";
import { guestCheckIn } from "./guest-actions";
import { verifyGeoLock } from "./geolock";
import { FormRenderer } from "@/components/forms/form-renderer";
import {
  parseSchema,
  validateAnswers,
  type AnswerMap,
  type AnswerValue,
  type FormSchema,
} from "@/lib/form-schema";

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
  is_geo_locked: boolean;
  latitude?: number;
  longitude?: number;
  radius_meters?: number;
  form_schema: FormSchema;
}

type Step = "email" | "profile";

export default function CheckinPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = React.use(params);
  const { user, isLoaded } = useUser();
  const [userAttendee, setUserAttendee] = useState<any>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [activeMeeting, setActiveMeeting] = useState<ActiveMeeting | null>(
    null,
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

  // Form answers, keyed by question id. Empty until the attendee fills anything
  // in; validateAnswers treats a missing key as unanswered.
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>({});

  const setAnswer = (questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    // Clear this question's error as soon as it is touched -- leaving a stale
    // "required" message under a field the attendee just filled reads as the
    // form being broken.
    setAnswerErrors((prev) => {
      if (!prev[questionId]) return prev;
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  /**
   * Client-side answer check, run before either submit path.
   *
   * Advisory only -- the server re-runs the same validateAnswers() against the
   * schema it reads itself. This exists so an attendee sees an inline error
   * instead of a round trip and a generic failure.
   */
  const validateForm = (): AnswerMap | null => {
    const schema = activeMeeting?.form_schema ?? [];
    const result = validateAnswers(schema, answers);
    setAnswerErrors(result.errors);
    if (!result.ok) {
      setCheckInError("Answer the required questions before checking in.");
      return null;
    }
    return result.answers;
  };

  const router = useRouter();
  const supabase = createClient();

  const getClerkEmail = () => {
    if (!user) return "";
    return (
      user.primaryEmailAddress?.emailAddress ||
      user.emailAddresses?.[0]?.emailAddress ||
      (user as any).email ||
      ""
    );
  };

  const getClerkFirstName = () => user?.firstName || "";
  const getClerkLastName = () => user?.lastName || "";

  useEffect(() => {
    if (!isLoaded) return;

    const init = async () => {
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("id, name, slug")
        .eq("slug", orgSlug)
        .single();

      if (orgError || !org) {
        console.error("Org query failed:", orgError);
        setError("Club does not exist");
        setLoading(false);
        return;
      }
      setOrganization(org);

      const { data: meetings } = await supabase
        .from("meetings")
        .select(
          "id, title, start_time, end_time, is_geo_locked, latitude, longitude, radius_meters, form_schema",
        )
        .eq("org_id", org.id)
        .eq("status", true)
        .order("start_time", { ascending: true })
        .limit(1);

      const meeting = meetings?.[0];
      setActiveMeeting(
        meeting
          ? { ...meeting, form_schema: parseSchema(meeting.form_schema) }
          : null,
      );

      if (user) {
        const { data: attendee } = await supabase
          .from("attendees")
          .select("id, first_name, last_name, email")
          .eq("user_id", user.id)
          .maybeSingle();

        if (attendee) {
          setUserAttendee(attendee);
        } else {
          const userEmail = getClerkEmail();

          if (userEmail) {
            const { data: attendeeByEmail, error: emailError } = await supabase
              .from("attendees")
              .select("id, first_name, last_name, email")
              .eq("email", userEmail)
              .maybeSingle();

            if (!emailError && attendeeByEmail) {
              const { data: linkedAttendee, error: linkError } = await supabase
                .from("attendees")
                .update({ user_id: user.id })
                .eq("id", attendeeByEmail.id)
                .select("id, first_name, last_name, email")
                .single();

              if (!linkError && linkedAttendee) {
                setUserAttendee(linkedAttendee);
              }
            }
          }
        }
      }

      setLoading(false);
    };

    init();
  }, [orgSlug, isLoaded, user, supabase]);

  // The attendance row is written by the memberCheckIn server action rather
  // than from here: RLS can constrain the row's own columns but cannot express
  // "answers must match this meeting's form_schema", so the insert has to
  // happen on the same side of the trust boundary as that check.
  const performCheckIn = async (
    attendeeId: string,
    validatedAnswers: AnswerMap,
  ) => {
    if (!organization || !activeMeeting) return;
    setCheckingIn(true);
    setCheckInError(null);

    try {
      const result = await memberCheckIn({
        orgSlug,
        answers: validatedAnswers,
      });

      if (!result.ok) {
        setCheckInError(result.error);
        if (result.answerErrors) setAnswerErrors(result.answerErrors);
        return;
      }

      if (result.alreadyCheckedIn) {
        setCheckInError("You've already checked in to this meeting.");
        return;
      }

      // Recompute membership status from attendance count vs the org's
      // threshold (pending until met, active once reached). Upserts the row and
      // preserves any existing role — so progress climbs 1/3 → 2/3 → member
      // instead of jumping to "active" on the first check-in.
      await resolveAndUpdateMembershipStatus(
        attendeeId,
        organization.id,
        orgSlug,
      );

      setCheckInSuccess(true);
    } catch (err) {
      setCheckInError(
        err instanceof Error
          ? err.message
          : "Check-in failed. Please try again.",
      );
    } finally {
      setCheckingIn(false);
    }
  };

  const checkLocation = async (): Promise<boolean> => {
    // Compare against null/undefined explicitly: latitude 0 (the equator) and
    // longitude 0 (the prime meridian) are valid coordinates, and a truthiness
    // check would silently skip the geolock for them.
    if (
      activeMeeting?.is_geo_locked &&
      activeMeeting.latitude != null &&
      activeMeeting.longitude != null
    ) {
      setCheckingIn(true);
      setCheckInError(null);

      const geoResult = await verifyGeoLock(
        activeMeeting.latitude,
        activeMeeting.longitude,
        activeMeeting.radius_meters || 200,
      );

      if (!geoResult.allowed) {
        setCheckInError(geoResult.error || "Failed geolocation check.");
        setCheckingIn(false);
        return false; // Stop!
      }
    }
    return true; // Pass!
  };

  const handleAuthenticatedCheckIn = async () => {
    if (!user || !userAttendee || !organization) return;

    // Answers first: a failed geolock costs a GPS round trip, and there is no
    // point paying it just to reject an incomplete form afterwards.
    const validatedAnswers = validateForm();
    if (!validatedAnswers) return;

    // Signed-in members are subject to the geolock too. This path previously
    // skipped checkLocation() entirely, so the guest flow was gated on location
    // while the (far more common) member flow was not -- which made
    // geo-locking effectively decorative.
    const isLocationValid = await checkLocation();
    if (!isLocationValid) return;

    await performCheckIn(userAttendee.id, validatedAnswers);
  };

  // Both guest steps go through one server action. The browser cannot do this
  // work itself: `anon` has INSERT on attendees but no SELECT, so
  // `.insert().select().single()` (an insert with read-back) is rejected as
  // "new row violates row-level security policy" even though the insert is
  // allowed -- and the duplicate-check lookup on attendance fails the same way.
  // See guest-actions.ts.
  const submitGuest = async (withProfile: boolean) => {
    const validatedAnswers = validateForm();
    if (!validatedAnswers) return;

    const isLocationValid = await checkLocation();
    if (!isLocationValid) return;

    setCheckInError(null);
    setCheckingIn(true);

    try {
      const result = await guestCheckIn({
        orgSlug,
        email,
        answers: validatedAnswers,
        ...(withProfile ? { firstName, lastName, gradYear } : {}),
      });

      if (result.ok) {
        setCheckInSuccess(true);
        return;
      }

      // The email isn't known yet -- collect a name and grad year, then retry.
      if (result.error === "NEEDS_PROFILE") {
        setStep("profile");
        return;
      }

      if (result.answerErrors) setAnswerErrors(result.answerErrors);
      setCheckInError(result.error);
    } catch {
      setCheckInError("An error occurred. Please try again.");
    } finally {
      setCheckingIn(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitGuest(false);
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitGuest(true);
  };

  // py-3 (not py-2) so the field clears the ~44px comfortable touch target --
  // this form is used almost entirely on phones at the door.
  const inputClass =
    "w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/50";

  if (!isLoaded || loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100dvh-var(--org-nav-h))]">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-var(--org-nav-h))] px-4 py-8 sm:px-6">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-3xl font-bold text-white mb-2 sm:text-4xl md:text-5xl">
            Club Check-In
          </h1>
          <p className="text-white/90 text-base sm:text-lg">Powered by ACM</p>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-5 sm:p-8 w-full max-w-2xl border border-white/20">
          <p className="text-white text-center text-lg sm:text-xl">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-var(--org-nav-h))] px-4 py-8 sm:px-6">
      <div className="text-center mb-6 sm:mb-8">
        <h1 className="text-3xl font-bold text-white mb-2 wrap-break-word sm:text-4xl md:text-5xl">
          {organization.name} Check-In
        </h1>
        <p className="text-white/90 text-base sm:text-lg">Powered by ACM</p>
      </div>

      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-5 sm:p-8 w-full max-w-2xl border border-white/20">
        {/* Meeting status header */}
        <div className="text-center mb-6">
          {activeMeeting ? (
            <>
              <p className="text-white/60 text-xs uppercase tracking-widest mb-1">
                Active Meeting
              </p>
              <h3 className="text-xl font-bold text-white wrap-break-word sm:text-2xl">
                {activeMeeting.title}
              </h3>
            </>
          ) : (
            <>
              <p className="text-white/60 text-xs uppercase tracking-widest mb-1">
                No Active Meeting
              </p>
              <h3 className="text-lg text-white/50 sm:text-xl">
                Check back later
              </h3>
            </>
          )}
        </div>

        {!activeMeeting ? (
          <div className="text-center">
            <p className="text-white/60 mb-4">
              There is no active meeting right now.
            </p>
            {/* router.back() used to sit here, which did nothing for anyone
                arriving straight from a QR link -- there is no history entry to
                return to. Point at the club page instead. Guests aren't offered
                it: /[orgSlug] requires a session and would bounce them to
                sign-in. */}
            {user && (
              <button
                type="button"
                onClick={() => router.push(`/${orgSlug}`)}
                className="w-full bg-white/20 hover:bg-white/30 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 border border-white/30"
              >
                Back to {organization.name}
              </button>
            )}
          </div>
        ) : checkInSuccess ? (
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
                No attendee profile found yet. We&apos;ll create one and check
                you in.
              </p>
            )}
            {activeMeeting.form_schema.length > 0 && (
              <div className="mb-5 text-left">
                <FormRenderer
                  schema={activeMeeting.form_schema}
                  answers={answers}
                  errors={answerErrors}
                  disabled={checkingIn}
                  onChange={setAnswer}
                />
              </div>
            )}
            {checkInError && (
              <p className="text-red-300 text-sm mb-3">{checkInError}</p>
            )}
            <button
              onClick={handleAuthenticatedCheckIn}
              disabled={!activeMeeting || checkingIn}
              className={`w-full font-semibold py-3 px-4 rounded-lg transition-all duration-200 border ${
                activeMeeting
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
                {/* The questions live on this step as well as the profile step:
                    a returning guest whose email is already known never reaches
                    the profile step, so putting them only there would skip the
                    form for most people. */}
                {activeMeeting.form_schema.length > 0 && (
                  <FormRenderer
                    schema={activeMeeting.form_schema}
                    answers={answers}
                    errors={answerErrors}
                    disabled={checkingIn}
                    onChange={setAnswer}
                  />
                )}
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
                    : !activeMeeting
                      ? "No Active Meeting"
                      : activeMeeting.form_schema.length > 0
                        ? "Check In"
                        : "Continue"}
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
                {/* Answers carry over from the email step -- `answers` is page
                    state, not per-form -- so anything already filled in is
                    still here after the bounce to this step. */}
                {activeMeeting.form_schema.length > 0 && (
                  <FormRenderer
                    schema={activeMeeting.form_schema}
                    answers={answers}
                    errors={answerErrors}
                    disabled={checkingIn}
                    onChange={setAnswer}
                  />
                )}
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

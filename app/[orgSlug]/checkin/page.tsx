"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { memberCheckIn, resolveAndUpdateMembershipStatus } from "./actions";
import { guestCheckIn } from "./guest-actions";
import { verifyGeoLock, type GeoFailure } from "./geolock";
import { membershipThreshold } from "@/lib/membership";
import { cn } from "@/lib/utils";
import { FormRenderer } from "@/components/forms/form-renderer";
import {
  CenteredScreen,
  CheckinScreen,
  MeetingStrip,
  Notice,
  PrimaryButton,
} from "@/components/checkin/shell";
import {
  Chip,
  Eyebrow,
  Field,
  Identity,
  StepBar,
  FIELD_CLASS,
} from "@/components/ui/primitives";
import {
  AlreadyCheckedInState,
  LoadingState,
  LocationAskState,
  LocationCheckingState,
  LocationDeniedState,
  NetworkErrorState,
  NoActiveMeetingState,
  OrgNotFoundState,
  SuccessState,
  TooFarState,
} from "@/components/checkin/states";
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
  description: string | null;
  start_time: string;
  end_time: string;
  is_geo_locked: boolean;
  latitude?: number;
  longitude?: number;
  radius_meters?: number;
  requires_checkin_password: boolean;
  form_schema: FormSchema;
}

/**
 * The screen the attendee is looking at.
 *
 * Modelled as one explicit union rather than a pile of booleans: the wireframe's
 * whole argument is that this page's states are the product, and "loading &&
 * !error && !success" spread across four flags is how the old build ended up
 * showing a network failure as "Club does not exist".
 */
type View =
  | { kind: "loading" }
  | { kind: "org_not_found" }
  | { kind: "no_meeting" }
  // Several meetings open at once -- the attendee picks before the form.
  | { kind: "choose_meeting" }
  | { kind: "form" }
  | { kind: "location_ask" }
  | { kind: "location_denied" }
  | { kind: "too_far"; metresAway: number; radius: number }
  | { kind: "already" }
  | { kind: "network_error"; detail?: string; ref?: string }
  | {
      kind: "success";
      firstName?: string;
      at: string;
      membership?: { attended: number; threshold: number };
    };

type Step = "email" | "profile";

/** EST, always — meetings are stored without a timezone. */
const EST = "America/New_York";
const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: EST,
});
const dayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: EST,
});

const fmtTime = (iso: string) => `${timeFmt.format(new Date(iso))} EST`;

/** "in 24 minutes" / "in 2 hours" — what a guest who arrived early needs. */
function opensIn(iso: string): string | undefined {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins <= 0 || !Number.isFinite(mins)) return undefined;
  if (mins < 60) return `in ${mins} minute${mins === 1 ? "" : "s"}`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs} hour${hrs === 1 ? "" : "s"}`;
  const days = Math.round(hrs / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** Short opaque ref so an officer can match a report to a log line. */
const errorRef = () =>
  `${Math.random().toString(16).slice(2, 6)}·${timeFmt.format(new Date())}`;

export default function CheckinPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = React.use(params);
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const supabase = createClient();

  const [view, setView] = useState<View>({ kind: "loading" });
  const [userAttendee, setUserAttendee] = useState<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [activeMeeting, setActiveMeeting] = useState<ActiveMeeting | null>(null);
  // Every meeting open right now. Usually one; more when a club runs a workshop
  // alongside a general body meeting. Kept so the attendee can switch back if
  // they pick the wrong one.
  const [openMeetings, setOpenMeetings] = useState<ActiveMeeting[]>([]);
  const [nextMeeting, setNextMeeting] = useState<{
    title: string;
    start_time: string;
    description: string | null;
  } | null>(null);

  // Guest flow
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gradYear, setGradYear] = useState("");

  const [checkingIn, setCheckingIn] = useState(false);
  const [locating, setLocating] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordAttempts, setPasswordAttempts] = useState(0);

  const [answers, setAnswers] = useState<AnswerMap>({});
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>({});
  const [checkinPassword, setCheckinPassword] = useState("");

  // Set once the geolock explainer has been shown, so a retry after "too far"
  // goes straight to the GPS read instead of re-explaining every time.
  const locationExplained = useRef(false);

  const setAnswer = (questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setAnswerErrors((prev) => {
      if (!prev[questionId]) return prev;
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  /**
   * Commit to one of several open meetings.
   *
   * Clears the per-meeting state: each meeting has its own form_schema,
   * password and geolock, so answers typed against one must not carry into
   * another. The geolock explainer is reset too -- a different meeting may have
   * a different radius, or none at all.
   */
  const selectMeeting = (meeting: ActiveMeeting) => {
    setActiveMeeting(meeting);
    setAnswers({});
    setAnswerErrors({});
    setCheckinPassword("");
    setPasswordError(null);
    setPasswordAttempts(0);
    setCheckInError(null);
    locationExplained.current = false;
    setView({ kind: "form" });
  };

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

  const load = useCallback(async () => {
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, name, slug")
      .eq("slug", orgSlug)
      .maybeSingle();

    // A missing row and a failed query are different failures with different
    // fixes, and the old build showed both as "Club does not exist".
    if (orgError) {
      setView({
        kind: "network_error",
        detail: `GET organizations · ${orgError.message}`,
        ref: errorRef(),
      });
      return;
    }
    if (!org) {
      setView({ kind: "org_not_found" });
      return;
    }
    setOrganization(org);

    const { data: meetings, error: meetingError } = await supabase
      .from("meetings")
      .select(
        "id, title, description, start_time, end_time, is_geo_locked, latitude, longitude, radius_meters, requires_checkin_password, form_schema",
      )
      .eq("org_id", org.id)
      .eq("status", true)
      .order("start_time", { ascending: true });

    if (meetingError) {
      setView({
        kind: "network_error",
        detail: `GET meetings · ${meetingError.message}`,
        ref: errorRef(),
      });
      return;
    }

    const parsed = (meetings ?? []).map((m) => ({
      ...m,
      form_schema: parseSchema(m.form_schema),
    }));
    setOpenMeetings(parsed);

    // Auto-select only when there is no ambiguity. With two meetings open,
    // picking one for the attendee would quietly record them against a meeting
    // they never chose -- so the picker below asks instead.
    const meeting = parsed.length === 1 ? parsed[0] : undefined;
    setActiveMeeting(meeting ?? null);

    // Nothing open: find what's next, so "arrived early" is a real screen with
    // a time on it rather than a shrug.
    if (parsed.length === 0) {
      const { data: upcoming } = await supabase
        .from("meetings")
        .select("title, start_time, description")
        .eq("org_id", org.id)
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(1);
      setNextMeeting(upcoming?.[0] ?? null);
    }

    if (user) {
      const { data: attendee } = await supabase
        .from("attendees")
        .select("id, first_name, last_name, email")
        .eq("user_id", user.id)
        .maybeSingle();

      if (attendee) {
        setUserAttendee(attendee);
      } else {
        const userEmail =
          user.primaryEmailAddress?.emailAddress ||
          user.emailAddresses?.[0]?.emailAddress ||
          "";
        if (userEmail) {
          // Blind claim, matched case-insensitively against the unique index on
          // lower(email) (20260813000000). Two things this deliberately does
          // NOT do: read the row first (attendees_read_own hides an unclaimed
          // row from the very user about to claim it, so the SELECT this used
          // to run always came back empty and the relink silently never fired),
          // and match with .eq() (which would miss a guest who typed
          // "Ada@ufl.edu" against a Clerk address of "ada@ufl.edu").
          //
          // attendees_claim_by_email is what makes this safe: USING
          // (user_id IS NULL) prevents claiming someone else's linked row, and
          // WITH CHECK forces the new user_id to be the caller's own.
          const { data: linked } = await supabase
            .from("attendees")
            .update({ user_id: user.id })
            .is("user_id", null)
            .ilike("email", userEmail)
            .select("id, first_name, last_name, email")
            .maybeSingle();
          if (linked) setUserAttendee(linked);
        }
      }
    }

    setView(
      parsed.length > 1
        ? { kind: "choose_meeting" }
        : meeting
          ? { kind: "form" }
          : { kind: "no_meeting" },
    );
  }, [orgSlug, supabase, user]);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    // If the org query hasn't resolved in 6s the card swaps to the network
    // error rather than spinning forever.
    const timeout = setTimeout(() => {
      if (cancelled) return;
      setView((v) =>
        v.kind === "loading"
          ? {
              kind: "network_error",
              detail: "GET organizations · no response after 6s",
              ref: errorRef(),
            }
          : v,
      );
    }, 6000);
    load().finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [isLoaded, load]);

  /**
   * Run the geolock. Returns true when the attendee may proceed; otherwise it
   * has already routed to the screen that explains what to do about it.
   */
  const passesLocation = async (): Promise<boolean> => {
    if (
      !activeMeeting?.is_geo_locked ||
      activeMeeting.latitude == null ||
      activeMeeting.longitude == null
    ) {
      return true;
    }

    const radius = activeMeeting.radius_meters || 200;

    // Explain before the browser's permission sheet appears.
    if (!locationExplained.current) {
      locationExplained.current = true;
      setView({ kind: "location_ask" });
      return false;
    }

    setLocating(true);
    const result = await verifyGeoLock(
      activeMeeting.latitude,
      activeMeeting.longitude,
      radius,
    );
    setLocating(false);

    if (result.allowed) return true;

    const f: GeoFailure = result.failure;
    if (f.kind === "denied") setView({ kind: "location_denied" });
    else if (f.kind === "too_far")
      setView({ kind: "too_far", metresAway: f.metresAway, radius: f.radius });
    else if (f.kind === "timeout")
      setView({
        kind: "network_error",
        detail: "geolocation · timeout after 10s",
        ref: errorRef(),
      });
    else setCheckInError(f.message);
    return false;
  };

  const succeed = async (attendeeId: string | null) => {
    let membership: { attended: number; threshold: number } | undefined;
    const threshold = membershipThreshold(orgSlug);
    if (attendeeId && organization && threshold !== null) {
      try {
        const r = await resolveAndUpdateMembershipStatus(
          attendeeId,
          organization.id,
          orgSlug,
        );
        membership = { attended: r.attendanceCount, threshold };
      } catch {
        // Membership is a nicety on this screen; the check-in itself landed.
      }
    }
    setView({
      kind: "success",
      firstName: userAttendee?.first_name ?? (firstName || undefined),
      at: fmtTime(new Date().toISOString()),
      membership,
    });

    // Drop the client Router Cache entry for this org's server-rendered routes.
    //
    // The check-in just changed data the stats page reads. Without this, the
    // "View stats" button below is a soft navigation, which React serves from
    // the cached RSC payload fetched BEFORE the check-in -- the member lands on
    // stats and sees their old count, the exact staleness this flow creates.
    // The stats route is force-dynamic, so once the cache entry is gone the
    // navigation re-renders against live data.
    router.refresh();
  };

  const handleMemberCheckIn = async () => {
    if (!user || !userAttendee || !organization || !activeMeeting) return;

    const validated = validateForm();
    if (!validated) return;
    if (!(await passesLocation())) return;

    setCheckingIn(true);
    setCheckInError(null);
    setPasswordError(null);
    try {
      const result = await memberCheckIn({
        orgSlug,
        answers: validated,
        password: checkinPassword,
        // Named explicitly so the server records the meeting the attendee
        // actually chose, rather than re-deriving "the earliest open one".
        meetingId: activeMeeting?.id,
      });

      if (!result.ok) {
        if (/password/i.test(result.error)) {
          setPasswordAttempts((n) => n + 1);
          setPasswordError(result.error);
        } else {
          setCheckInError(result.error);
        }
        if (result.answerErrors) setAnswerErrors(result.answerErrors);
        return;
      }
      if (result.alreadyCheckedIn) {
        setView({ kind: "already" });
        return;
      }
      await succeed(userAttendee.id);
    } catch (err) {
      setView({
        kind: "network_error",
        detail: `POST checkin · ${err instanceof Error ? err.message : "failed"}`,
        ref: errorRef(),
      });
    } finally {
      setCheckingIn(false);
    }
  };

  const submitGuest = async (withProfile: boolean) => {
    const validated = validateForm();
    if (!validated) return;
    if (!(await passesLocation())) return;

    setCheckInError(null);
    setPasswordError(null);
    setCheckingIn(true);
    try {
      const result = await guestCheckIn({
        orgSlug,
        email,
        answers: validated,
        password: checkinPassword,
        meetingId: activeMeeting?.id,
        ...(withProfile ? { firstName, lastName, gradYear } : {}),
      });

      if (result.ok) {
        await succeed(null);
        return;
      }
      if (result.error === "NEEDS_PROFILE") {
        setStep("profile");
        return;
      }
      if (/already checked in/i.test(result.error)) {
        setView({ kind: "already" });
        return;
      }
      if (/password/i.test(result.error)) {
        setPasswordAttempts((n) => n + 1);
        setPasswordError(result.error);
      } else {
        setCheckInError(result.error);
      }
      if (result.answerErrors) setAnswerErrors(result.answerErrors);
    } catch (err) {
      setView({
        kind: "network_error",
        detail: `POST checkin · ${err instanceof Error ? err.message : "failed"}`,
        ref: errorRef(),
      });
    } finally {
      setCheckingIn(false);
    }
  };

  /** Re-run the submit that got interrupted by a location or network failure. */
  const retry = async () => {
    setView({ kind: "form" });
    if (user && userAttendee) await handleMemberCheckIn();
    else await submitGuest(step === "profile");
  };

  const busy = checkingIn || locating;

  if (!isLoaded || view.kind === "loading") return <LoadingState />;

  if (view.kind === "org_not_found") return <OrgNotFoundState slug={orgSlug} />;

  if (view.kind === "network_error")
    return (
      <NetworkErrorState
        detail={view.detail}
        reference={view.ref}
        onRetry={organization ? retry : () => window.location.reload()}
        busy={busy}
      />
    );

  // Several meetings open at once. Ask rather than guess: recording someone
  // against a meeting they did not pick is worse than one extra tap, and it is
  // invisible to them when it goes wrong.
  if (view.kind === "choose_meeting")
    return (
      <CenteredScreen>
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-2xl font-bold tracking-[-0.02em] text-ink">
            Choose a meeting
          </h1>
          <p className="m-0 text-sm leading-relaxed text-ink-muted">
            {openMeetings.length} meetings are open right now. Pick the one
            you&apos;re attending.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {openMeetings.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => selectMeeting(m)}
              className="cursor-pointer rounded-card border border-line bg-surface p-4 text-left transition-colors hover:border-accent hover:bg-accent-soft"
            >
              <span className="block text-[15px] font-bold text-ink">
                {m.title}
              </span>
              <span className="block text-[13px] text-ink-muted">
                {fmtTime(m.start_time)} – {fmtTime(m.end_time)}
                {m.description ? ` · ${m.description}` : ""}
              </span>
              {(m.is_geo_locked || m.requires_checkin_password) && (
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {m.is_geo_locked && <Chip>Geo</Chip>}
                  {m.requires_checkin_password && <Chip>Password</Chip>}
                </span>
              )}
            </button>
          ))}
        </div>
      </CenteredScreen>
    );

  if (view.kind === "no_meeting")
    return (
      <NoActiveMeetingState
        opensIn={nextMeeting ? opensIn(nextMeeting.start_time) : undefined}
        next={
          nextMeeting
            ? {
                title: nextMeeting.title,
                when: `${dayFmt.format(new Date(nextMeeting.start_time))} · ${fmtTime(nextMeeting.start_time)}`,
                where: nextMeeting.description ?? undefined,
              }
            : undefined
        }
        onAbout={user ? () => router.push(`/${orgSlug}`) : undefined}
      />
    );

  if (view.kind === "success")
    return (
      <SuccessState
        firstName={view.firstName}
        meetingTitle={activeMeeting?.title ?? "the meeting"}
        where={activeMeeting?.description ?? undefined}
        at={view.at}
        membership={view.membership}
        orgName={organization?.name ?? "this club"}
        onStats={user ? () => router.push(`/${orgSlug}/stats`) : undefined}
      />
    );

  if (view.kind === "already")
    return (
      <AlreadyCheckedInState
        meetingTitle={activeMeeting?.title ?? "this meeting"}
        at={fmtTime(new Date().toISOString())}
        onStats={user ? () => router.push(`/${orgSlug}/stats`) : undefined}
      />
    );

  if (view.kind === "location_ask")
    // Once the fix is actually being taken, the ask becomes a progress screen --
    // otherwise the button just sits there looking unresponsive for 3 seconds.
    return locating ? (
      <LocationCheckingState />
    ) : (
      <LocationAskState
        radius={activeMeeting?.radius_meters || 200}
        where={activeMeeting?.description ?? undefined}
        onShare={retry}
        busy={busy}
      />
    );

  if (view.kind === "location_denied")
    return <LocationDeniedState onRetry={retry} busy={busy} />;

  if (view.kind === "too_far")
    return (
      <TooFarState
        metresAway={view.metresAway}
        radius={view.radius}
        where={activeMeeting?.description ?? undefined}
        onRetry={retry}
        busy={busy}
      />
    );

  // ---- The form itself (states 3, 4, 5, 10, 13) ----

  const meeting = activeMeeting!;
  const isMemberPath = Boolean(user && userAttendee);
  const hasQuestions = meeting.form_schema.length > 0;

  const passwordField = meeting.requires_checkin_password && (
    <Field
      label="Meeting password"
      htmlFor="checkin-password"
      badge={<Chip>Conditional</Chip>}
      error={
        passwordError
          ? `That's not the password for this meeting. It's on the slide at the front of the room — case doesn't matter.${
              passwordAttempts > 1 ? ` Attempt ${passwordAttempts} of 5.` : ""
            }`
          : null
      }
      hint="Shown on the slide at the front of the room."
    >
      <input
        id="checkin-password"
        type="password"
        value={checkinPassword}
        onChange={(e) => {
          setCheckinPassword(e.target.value);
          setPasswordError(null);
        }}
        disabled={busy}
        required
        placeholder="••••"
        className={cn(
          FIELD_CLASS,
          "tracking-[0.3em]",
          passwordError && "border-bad",
        )}
      />
    </Field>
  );

  const questions = hasQuestions && (
    <div className="flex flex-col gap-3">
      <Eyebrow>
        {meeting.form_schema.length} question
        {meeting.form_schema.length === 1 ? "" : "s"}
      </Eyebrow>
      <FormRenderer
        schema={meeting.form_schema}
        answers={answers}
        errors={answerErrors}
        disabled={busy}
        onChange={setAnswer}
      />
    </div>
  );

  const strip = (
    <>
      <MeetingStrip
        title={meeting.title}
        when={`${fmtTime(meeting.start_time)} – ${fmtTime(meeting.end_time)}`}
        where={meeting.description ?? undefined}
        status={{ label: "check-in open", tone: "good" }}
      />
      {/* Only when the choice was real. A wrong pick is otherwise a dead end:
          the attendee would have to reload to get back to the list. */}
      {openMeetings.length > 1 && (
        <button
          type="button"
          onClick={() => setView({ kind: "choose_meeting" })}
          disabled={busy}
          className="-mt-1 cursor-pointer self-start bg-transparent p-0 text-[13px] text-ink-muted underline disabled:opacity-50"
        >
          Not this one? Choose a different meeting
        </button>
      )}
    </>
  );

  const errorNotice = checkInError && <Notice tone="bad" title={checkInError} />;

  const submitLabel = locating
    ? "Checking you're in the room…"
    : checkingIn
      ? "Checking in…"
      : "Check in";

  // State 13 — member, one tap. The most-used path in the product.
  if (isMemberPath) {
    return (
      <CheckinScreen
        footer={
          <div className="flex flex-col gap-2.5">
            {errorNotice}
            <PrimaryButton
              hero={!hasQuestions}
              onClick={handleMemberCheckIn}
              disabled={busy}
            >
              {submitLabel}
            </PrimaryButton>
            {hasQuestions && (
              <p className="m-0 text-center text-[13px] text-ink-faint">
                {meeting.form_schema.length} question
                {meeting.form_schema.length === 1 ? "" : "s"} after this
              </p>
            )}
          </div>
        }
      >
        {/* The member's own identity, confirmed before they tap. */}
        <div className="flex items-center gap-3">
          <Identity
            label={`${userAttendee!.first_name?.[0] ?? ""}${userAttendee!.last_name?.[0] ?? ""}`.toUpperCase()}
            size="md"
          />
          <span className="flex flex-col">
            <span className="text-base font-bold text-ink">
              {userAttendee!.first_name} {userAttendee!.last_name}
            </span>
            <span className="text-[13px] text-ink-faint">
              Checking in as you
            </span>
          </span>
        </div>
        <div className="h-px bg-line-soft" />
        {strip}
        {passwordField}
        {questions}
      </CheckinScreen>
    );
  }

  // State 3 — guest, step 1: email.
  if (step === "email") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitGuest(false);
        }}
      >
        <CheckinScreen
          header={<StepBar total={hasQuestions ? 3 : 2} current={1} />}
          footer={
            <div className="flex flex-col gap-2.5">
              {errorNotice}
              <PrimaryButton type="submit" disabled={busy}>
                {submitLabel}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => router.push("/sign-in")}
                className="text-center text-[13px] text-ink-muted underline underline-offset-2"
              >
                Have an account? Sign in instead
              </button>
            </div>
          }
        >
          {strip}
          <Field
            label="Email"
            htmlFor="checkin-email"
            hint="We use this to match you to an existing record. No account needed."
          >
            <input
              id="checkin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              inputMode="email"
              autoComplete="email"
              placeholder="you@ufl.edu"
              disabled={busy}
              className={FIELD_CLASS}
            />
          </Field>

          {passwordField}
          {questions}
        </CheckinScreen>
      </form>
    );
  }

  // State 4 — guest, step 2: unknown email, collect a name and grad year.
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submitGuest(true);
      }}
    >
      <CheckinScreen
        header={
          <>
            <button
              type="button"
              onClick={() => setStep("email")}
              disabled={busy}
              className="flex cursor-pointer items-center gap-2 self-start bg-transparent p-0 text-sm text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
            >
              <span aria-hidden="true" className="text-[17px]">
                ←
              </span>
              Back
            </button>
            <StepBar total={hasQuestions ? 3 : 2} current={2} />
          </>
        }
        footer={
          <div className="flex flex-col gap-2.5">
            {errorNotice}
            <PrimaryButton type="submit" disabled={busy}>
              {submitLabel}
            </PrimaryButton>
          </div>
        }
      >
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-2xl font-bold tracking-[-0.02em] text-ink">
            First time here
          </h1>
          <p className="m-0 text-sm leading-relaxed text-ink-muted">
            <b className="font-semibold text-ink">{email}</b> isn&apos;t on the
            roster yet. Two fields and you&apos;re in — this is the only time
            we&apos;ll ask.
          </p>
        </div>

        {/* Names sit side by side: two half-width fields read as one unit,
            which is what a name is. */}
        <div className="flex gap-3">
          <Field label="First name" htmlFor="checkin-first" className="flex-1">
            <input
              id="checkin-first"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoFocus
              autoComplete="given-name"
              placeholder="Maya"
              disabled={busy}
              className={FIELD_CLASS}
            />
          </Field>
          <Field label="Last name" htmlFor="checkin-last" className="flex-1">
            <input
              id="checkin-last"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              autoComplete="family-name"
              placeholder="Rivera"
              disabled={busy}
              className={FIELD_CLASS}
            />
          </Field>
        </div>

        {/* A plain field rather than a row of year chips. The chips hardcoded
            a four-year window, so they silently went stale every year and an
            incoming freshman always had to reach for "Other" anyway. */}
        <Field label="Graduation year" htmlFor="checkin-grad-year">
          <input
            id="checkin-grad-year"
            type="text"
            inputMode="numeric"
            value={gradYear}
            onChange={(e) => setGradYear(e.target.value)}
            required
            placeholder="e.g. 2030"
            disabled={busy}
            className={FIELD_CLASS}
          />
        </Field>

        {passwordField}
        {questions}
      </CheckinScreen>
    </form>
  );
}

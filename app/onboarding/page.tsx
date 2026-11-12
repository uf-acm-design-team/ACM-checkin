"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { callEdgeFunction } from "@/lib/edge-functions";
import type { OnboardAttendeeResponse } from "../../supabase/functions/onboard-attendee/contract";
import {
  Button,
  Field,
  Notice,
  Spinner,
  FIELD_CLASS,
} from "@/components/ui/primitives";

const MAX_NAME_LENGTH = 50;

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  // Skip the form for anyone the database already knows: users who already
  // have an attendees row, and guests whose earlier check-ins share this
  // account's email. onboard-attendee's link-only mode (an empty body) links
  // that row and answers needsProfile when there's nothing to link. See
  // docs/API.md.
  //
  // Runs at most once per mount. `user` is a dependency, but calling
  // user.reload() after a successful submit mutates that object and refires
  // the effect -- which reset checkingExisting to true and left the page stuck
  // on "Loading..." after clicking Continue. The ref makes the check
  // idempotent so post-submit navigation is never interrupted.
  const syncStarted = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (syncStarted.current) return;

    // No signed-in user: nothing to sync. Clear the gate so the redirect to
    // /sign-in below is reachable -- returning early here (as this once did)
    // left checkingExisting true forever and the page hung on "Loading...".
    if (!user) {
      setCheckingExisting(false);
      return;
    }

    syncStarted.current = true;

    let cancelled = false;
    callEdgeFunction<OnboardAttendeeResponse>("onboard-attendee", {}, getToken)
      .then((result) => {
        if (cancelled) return;
        // Any failure falls back to the form, which is recoverable: submitting
        // it calls the same function and shows its error.
        if (!result.ok) console.error("Onboarding status check failed:", result.code, result.error);
        const alreadyOnboarded = result.ok && !result.needsProfile;
        // Always clear the gate, including on the redirect path. Leaving it set
        // meant that if the navigation didn't take (proxy bounce, blocked
        // route), the page rendered "Loading..." with nothing left to resolve it.
        setCheckingExisting(false);
        if (alreadyOnboarded) {
          setSuccess(true);
          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 1200);
        }
      })
      .catch((err) => {
        // callEdgeFunction never rejects; this only guards against a bug in
        // the handler above leaving the page stuck on "Loading...".
        console.error("Onboarding status check failed:", err);
        if (!cancelled) setCheckingExisting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, user, getToken]);

  if (!isLoaded || checkingExisting) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-3">
        <Spinner size={26} />
        <span className="text-sm text-ink-faint">Loading…</span>
      </div>
    );
  }

  if (!user) {
    router.push("/sign-in");
    return null;
  }

  if (success) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
        <Notice tone="good" title="Successfully authenticated!" className="max-w-sm text-center">
          Taking you to your dashboard…
        </Notice>
        <Spinner size={22} />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedGradYear = gradYear.trim();

    //ensure the name is valid, configurable in case of outliers and we have to update lol
    if (trimmedFirstName.length === 0 || trimmedFirstName.length > MAX_NAME_LENGTH) {
      setError(`First name must be between 1 and ${MAX_NAME_LENGTH} characters.`);
      return;
    }

    if (trimmedLastName.length === 0 || trimmedLastName.length > MAX_NAME_LENGTH) {
      setError(`Last name must be between 1 and ${MAX_NAME_LENGTH} characters.`);
      return;
    }

    //ensure the grad year is a number
    if (!/^\d+$/.test(trimmedGradYear)) {
      setError("Grad year must be a number.");
      return;
    }

    setLoading(true);

    try {
      // onboard-attendee links a guest row with this account's email, or
      // creates a fresh attendee, then updates the Clerk name. It runs as
      // service role and reads the identity and email from the token, never
      // from this body. (An RLS-gated claim from this page used to fail
      // silently, which surfaced as "already linked to another account" for
      // emails that were in fact the caller's own.)
      const result = await callEdgeFunction<OnboardAttendeeResponse>(
        "onboard-attendee",
        { firstName: trimmedFirstName, lastName: trimmedLastName, gradYear: trimmedGradYear },
        getToken,
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Profile mode always saves a row, so this can't happen. Guarded so a
      // contract change can't send someone on without one.
      if (result.needsProfile) {
        setError("Couldn't save your profile. Please try again.");
        return;
      }

      // Refresh the session token so it carries the new publicMetadata --
      // without this the proxy reads the old claims on the very next request.
      await user.reload();

      setSuccess(true);

      // Full page load, not router.push(). A client-side nav reuses the
      // existing React tree and the cached session token, so the proxy can
      // still see the pre-onboarding claims and bounce straight back here.
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1200);
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-2xl font-bold tracking-[-0.02em] text-ink">
          Complete your profile
        </h1>
        <p className="m-0 text-[15px] leading-relaxed text-ink-muted">
          Three fields and you&apos;re set — this is the only time we&apos;ll ask.
        </p>
      </div>

      {error && (
        <Notice tone="bad" className="mt-5">
          {error}
        </Notice>
      )}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        {/* First and last sit side by side: two half-width fields read as one
            unit, which is what a name is. */}
        <div className="flex gap-3">
          <Field label="First name" htmlFor="onboarding-first" className="flex-1">
            <input
              id="onboarding-first"
              type="text"
              placeholder="Maya"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoFocus
              autoComplete="given-name"
              maxLength={MAX_NAME_LENGTH}
              className={FIELD_CLASS}
            />
          </Field>
          <Field label="Last name" htmlFor="onboarding-last" className="flex-1">
            <input
              id="onboarding-last"
              type="text"
              placeholder="Rivera"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              autoComplete="family-name"
              maxLength={MAX_NAME_LENGTH}
              className={FIELD_CLASS}
            />
          </Field>
        </div>

        <Field
          label="Graduation year"
          htmlFor="onboarding-grad"
          hint="Four digits, e.g. 2027."
        >
          <input
            id="onboarding-grad"
            type="text"
            inputMode="numeric"
            placeholder="2027"
            value={gradYear}
            onChange={(e) => setGradYear(e.target.value.replace(/\D/g, ""))}
            required
            maxLength={4}
            className={FIELD_CLASS}
          />
        </Field>

        <Button type="submit" disabled={loading} fullWidth size="lg" className="mt-1">
          {loading ? "Saving…" : "Continue"}
        </Button>
      </form>
    </div>
  );
}

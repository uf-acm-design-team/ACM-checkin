"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { createClient } from "../utils/supabase/client";
import { completeOnboarding, syncOnboardingStatus } from "./actions";
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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Users who already have an attendees row but no onboarding flag (they
  // signed up before this gate existed) shouldn't be asked to re-enter a
  // profile the database already has. Flip their flag and send them on.
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
    syncOnboardingStatus()
      .then(({ alreadyOnboarded }) => {
        if (cancelled) return;
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
        // Surface the failure instead of hanging. A rejected server action
        // here usually means the Supabase call inside it failed (e.g. Clerk
        // JWT not verifiable), which is worth showing rather than swallowing.
        console.error("Onboarding status check failed:", err);
        if (!cancelled) setCheckingExisting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, user, router]);

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
      // Check if attendee profile already exists
      const { data: existing } = await supabase
        .from("attendees")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        // Row already there (e.g. claimed via guest check-in) -- mark complete
        // so the proxy stops redirecting back here.
        await completeOnboarding();
        await user.reload();
        setSuccess(true);
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 1200);
        return;
      }

      // primaryEmailAddress can be unset even once Clerk has finished loading
      // (seen after OAuth sign-up, before Clerk resolves a primary pointer) --
      // fall back to the first address on file, same as checkin/page.tsx does.
      const email =
        user.primaryEmailAddress?.emailAddress ||
        user.emailAddresses?.[0]?.emailAddress ||
        "";

      // Claim an orphaned guest row before inserting.
      //
      // Guest check-in creates an attendee with user_id = NULL keyed only on a
      // typed email (see checkin/guest-actions.ts). Signing up later with that
      // same address used to go straight to the INSERT below and collide with
      // attendees_email_lower_key (20260813000000), so the person could never
      // finish onboarding -- and their guest attendance was stranded on a row
      // nobody could reach.
      //
      // This has to be a BLIND update: attendees_read_own only exposes rows
      // whose user_id is already the caller's, so the orphan is invisible to a
      // SELECT and .maybeSingle() would return null even though the row exists.
      // The claim is safe because attendees_claim_by_email restricts it in
      // Postgres -- USING (user_id IS NULL) means an already-claimed row cannot
      // be stolen, and WITH CHECK pins the new value to the caller's own Clerk
      // id. Matched with ilike() to line up with the unique index on
      // lower(email); .eq() would miss "Ada@ufl.edu" vs "ada@ufl.edu" and fall
      // through to the same duplicate-key error.
      //
      // The returned rows tell us whether anything matched -- the same UPDATE
      // both detects and performs the claim, so there is no TOCTOU window.
      const claimGuestRow = async (): Promise<{ claimed: boolean; error?: string }> => {
        if (!email) return { claimed: false };
        const { data: claimedRows, error: claimError } = await supabase
          .from("attendees")
          .update({ user_id: user.id })
          .is("user_id", null)
          .ilike("email", email)
          .select("id");

        if (claimError) return { claimed: false, error: claimError.message };
        return { claimed: (claimedRows?.length ?? 0) > 0 };
      };

      const firstAttempt = await claimGuestRow();
      if (firstAttempt.error) {
        setError("Failed to link your existing check-ins: " + firstAttempt.error);
        return;
      }
      let claimed = firstAttempt.claimed;

      // Only insert when there was no guest row to adopt. The claimed row keeps
      // the name and grad year it was checked in with; the form's values are
      // discarded rather than overwriting what an officer may already have seen
      // on a roster.
      if (!claimed) {
        const { error: insertError } = await supabase.from("attendees").insert({
          user_id: user.id,
          email,
          first_name: trimmedFirstName,
          last_name: trimmedLastName,
          grad_year: trimmedGradYear,
        });

        if (insertError) {
          // 23505 on attendees_email_lower_key means a row with this email
          // exists that the claim above didn't catch -- e.g. a guest row
          // created in the instant between that UPDATE and this INSERT.
          // Re-run the claim once rather than dead-ending on a raw DB error:
          // if it matches now, this request simply lost a race, not a real
          // conflict. If it still matches nothing, the email is genuinely
          // owned by another linked account.
          const isEmailConflict =
            insertError.code === "23505" &&
            insertError.message.includes("attendees_email_lower_key");

          if (isEmailConflict) {
            const retry = await claimGuestRow();
            claimed = retry.claimed;
          }

          if (!claimed) {
            setError(
              isEmailConflict
                ? "This email is already linked to another account. Contact an officer if that's unexpected."
                : "Failed to save profile: " + insertError.message,
            );
            return;
          }
        }
      }

      // Update Clerk user metadata with the name
      await user.update({
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
      });

      // Flip the onboarding flag the proxy gates on. This must happen before
      // navigating, or the proxy sees a stale token and bounces straight back.
      const result = await completeOnboarding();
      if (!result.ok) {
        setError(
          "Failed to complete onboarding: " + (result.error ?? "unknown"),
        );
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

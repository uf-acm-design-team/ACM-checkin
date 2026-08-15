"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { createClient } from "../utils/supabase/client";
import { completeOnboarding, syncOnboardingStatus } from "./actions";

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [error, setError] = useState("");
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
          window.location.href = "/dashboard";
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    router.push("/sign-in");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
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
        window.location.href = "/dashboard";
        return;
      }

      const { error: insertError } = await supabase.from("attendees").insert({
        user_id: user.id,
        email: user.primaryEmailAddress?.emailAddress || "",
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        grad_year: gradYear.trim(),
      });

      if (insertError) {
        setError("Failed to save profile: " + insertError.message);
        return;
      }

      // Update Clerk user metadata with the name
      await user.update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
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

      // Full page load, not router.push(). A client-side nav reuses the
      // existing React tree and the cached session token, so the proxy can
      // still see the pre-onboarding claims and bounce straight back here.
      router.push("/dashboard");
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="text-center mb-8">
        <h1 className="text-5xl font-bold text-white mb-2">UF Check-In</h1>
        <p className="text-white/90 text-lg">Powered by ACM</p>
      </div>

      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 w-full max-w-md border border-white/20">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">
            Complete Your Profile
          </h2>
          <p className="text-white/80">
            Just a few more details to get started
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="w-full bg-white/20 placeholder-white/70 text-white font-semibold py-3 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50 transition-all duration-200 backdrop-blur-sm border border-white/30"
            />
          </div>
          <div>
            <input
              type="text"
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="w-full bg-white/20 placeholder-white/70 text-white font-semibold py-3 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50 transition-all duration-200 backdrop-blur-sm border border-white/30"
            />
          </div>
          <div>
            <input
              type="text"
              placeholder="Grad Year (e.g., 2027)"
              value={gradYear}
              onChange={(e) => setGradYear(e.target.value)}
              required
              className="w-full bg-white/20 placeholder-white/70 text-white font-semibold py-3 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50 transition-all duration-200 backdrop-blur-sm border border-white/30"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FA4616] hover:bg-[#e03d0f] text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Saving..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

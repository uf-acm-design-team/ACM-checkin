"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { createClient } from "../utils/supabase/client";
import { Spinner } from "@/components/ui/primitives";

const MAX_NAME_LENGTH = 50;

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const supabase = createClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.push("/sign-in");
      return;
    }

    const loadProfile = async () => {
      const { data, error: fetchError } = await supabase
        .from("attendees")
        .select("first_name, last_name, grad_year")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchError) {
        console.error("Failed to load attendee profile:", fetchError);
        setError("Could not load your profile.");
      } else if (data) {
        setFirstName(data.first_name ?? "");
        setLastName(data.last_name ?? "");
        setGradYear((data.grad_year ?? "").toString());
      }

      setIsInitialized(true);
    };

    loadProfile();
  }, [isLoaded, router, supabase, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedGradYear = gradYear.trim();

    if (trimmedFirstName.length === 0 || trimmedFirstName.length > MAX_NAME_LENGTH) {
      setError(`First name must be between 1 and ${MAX_NAME_LENGTH} characters.`);
      return;
    }

    if (trimmedLastName.length === 0 || trimmedLastName.length > MAX_NAME_LENGTH) {
      setError(`Last name must be between 1 and ${MAX_NAME_LENGTH} characters.`);
      return;
    }

    if (!/^\d+$/.test(trimmedGradYear)) {
      setError("Grad year must be a number.");
      return;
    }

    if (!user) {
      setError("You must be signed in to update your profile.");
      return;
    }

    setLoading(true);

    try {
      const { error: attendeeError } = await supabase
        .from("attendees")
        .update({
          first_name: trimmedFirstName,
          last_name: trimmedLastName,
          grad_year: trimmedGradYear,
        })
        .eq("user_id", user.id);

      if (attendeeError) {
        setError("Failed to update your profile: " + attendeeError.message);
        return;
      }

      await user.update({
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
      });

      setSuccess("Profile updated.");
      router.push("/dashboard");
    } catch (err) {
      console.error("Profile update failed:", err);
      setError("An unexpected error occurred while updating your profile.");
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded || !isInitialized) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="flex items-center gap-3"><Spinner size={26} /><span className="text-sm text-ink-faint">Loading…</span></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md rounded-panel border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-8">
        <div className="mb-6 text-center">
          <h1 className="mb-2 text-2xl font-bold tracking-[-0.02em] text-ink sm:text-3xl">
            Profile Settings
          </h1>
          <p className="text-sm text-ink-muted">
            Update your name and graduation year.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-card border border-bad-line bg-bad-surface p-3 text-sm text-bad-ink">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-card border border-good-line bg-good-surface p-3 text-sm text-good-ink">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ink-strong">
              First name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={MAX_NAME_LENGTH}
              className="w-full rounded-control border border-line bg-surface px-4 py-3 text-ink placeholder:text-ink-faint transition-colors focus:border-accent focus:outline-none"
              placeholder="First Name"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ink-strong">
              Last name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={MAX_NAME_LENGTH}
              className="w-full rounded-control border border-line bg-surface px-4 py-3 text-ink placeholder:text-ink-faint transition-colors focus:border-accent focus:outline-none"
              placeholder="Last Name"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ink-strong">
              Grad year
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={gradYear}
              onChange={(e) => setGradYear(e.target.value.replace(/\D/g, ""))}
              maxLength={4}
              className="w-full rounded-control border border-line bg-surface px-4 py-3 text-ink placeholder:text-ink-faint transition-colors focus:border-accent focus:outline-none"
              placeholder="2027"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="flex-1 cursor-pointer rounded-control border border-line bg-surface px-4 py-3 font-semibold text-ink-strong transition-colors hover:bg-surface-sunken"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 cursor-pointer rounded-control bg-accent px-4 py-3 font-semibold text-accent-ink transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

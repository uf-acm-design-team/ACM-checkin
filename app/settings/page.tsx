"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { createClient } from "../utils/supabase/client";

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
        <div className="text-xl text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/10 p-5 shadow-2xl backdrop-blur-md sm:p-8">
        <div className="mb-6 text-center">
          <h1 className="mb-2 text-2xl font-bold text-white sm:text-3xl">
            Profile Settings
          </h1>
          <p className="text-sm text-white/80">
            Update your name and graduation year.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-white/90">
              First name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={MAX_NAME_LENGTH}
              className="w-full rounded-lg border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/50"
              placeholder="First Name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-white/90">
              Last name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={MAX_NAME_LENGTH}
              className="w-full rounded-lg border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/50"
              placeholder="Last Name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-white/90">
              Grad year
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={gradYear}
              onChange={(e) => setGradYear(e.target.value.replace(/\D/g, ""))}
              maxLength={4}
              className="w-full rounded-lg border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/50"
              placeholder="2027"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="flex-1 rounded-lg border border-white/30 bg-white/5 px-4 py-3 font-semibold text-white transition hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-brand-action px-4 py-3 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { createClient } from "../utils/supabase/client";

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  if (!isLoaded) {
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
        router.push("/dashboard");
        return;
      }

      const { error: insertError } = await supabase
        .from("attendees")
        .insert({
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

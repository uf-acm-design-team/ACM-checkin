"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };

    getUser();
  }, [supabase.auth]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Loading... 6 7</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="text-center mb-8">
        <h1 className="text-5xl font-bold text-white mb-2">UF Check-In</h1>
        <p className="text-white/90 text-lg">Powered by ACM</p>
      </div>

      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 w-full max-w-2xl border border-white/20">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">
            Welcome to your Dashboard!
          </h2>
          <p className="text-white/80">
            You&apos;re logged in as{" "}
            <span className="font-semibold">{user?.email}</span>
          </p>
        </div>

        <div className="space-y-6">
          <div className="bg-white/10 rounded-lg p-6 border border-white/20">
            <h3 className="text-xl font-semibold text-white mb-3">
              Check-In History
            </h3>
            <p className="text-white/70">
              Your check-in history will appear here.
            </p>
          </div>

          <div className="bg-white/10 rounded-lg p-6 border border-white/20">
            <h3 className="text-xl font-semibold text-white mb-3">
              Upcoming Events
            </h3>
            <p className="text-white/70">ACM events will be displayed here.</p>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full bg-white/20 hover:bg-white/30 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/30"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

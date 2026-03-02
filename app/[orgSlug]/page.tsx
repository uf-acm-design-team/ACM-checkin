"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

export default function OrgPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = React.use(params);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [attendanceCount, setAttendanceCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/");
        return;
      }

      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("id, name, slug")
        .eq("slug", orgSlug)
        .single();

      if (orgError || !org) {
        setError("Club does not exist");
        setLoading(false);
        return;
      }

      setOrganization(org);

      const { data: attendee } = await supabase
        .from("attendee")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (attendee) {
        const { count } = await supabase
          .from("attendance")
          .select("*", { count: "exact", head: true })
          .eq("attendee_id", attendee.id)
          .eq("org_id", org.id);
        setAttendanceCount(count || 0);
      }

      setLoading(false);
    };

    init();
  }, [orgSlug, supabase, router]);

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
          <h1 className="text-5xl font-bold text-white mb-2">Club</h1>
          <p className="text-white/90 text-lg">Powered by ACM</p>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 w-full max-w-sm border border-white/20">
          <p className="text-white text-center text-xl">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="text-center mb-8">
        <h1 className="text-5xl font-bold text-white mb-2">
          {organization.name}
        </h1>
        <p className="text-white/90 text-lg">Powered by ACM</p>
      </div>

      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 w-full max-w-sm border border-white/20">
        <p className="text-white/60 text-sm text-center mb-8">
          You&apos;ve attended{" "}
          <span className="text-white font-semibold">{attendanceCount}</span>{" "}
          {attendanceCount === 1 ? "meeting" : "meetings"}
        </p>

        <div className="space-y-3">
          <button
            onClick={() => router.push(`/${orgSlug}/checkin`)}
            className="w-full bg-white text-black font-bold py-4 px-6 rounded-xl transition-all duration-200 hover:bg-white/90 text-lg"
          >
            Check In
          </button>
          <button
            onClick={() => router.push(`${orgSlug}/stats`)}
            className="w-full bg-white/15 hover:bg-white/25 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 border border-white/20"
          >
            Stats
          </button>
        </div>
      </div>
    </div>
  );
}

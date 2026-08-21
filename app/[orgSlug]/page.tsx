"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { createClient } from "../utils/supabase/client";
import { useBranding } from "@/app/components/BrandingProvider";
import { membershipThreshold } from "@/lib/membership";

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
  const { user, isLoaded } = useUser();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [attendanceCount, setAttendanceCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();
  const { logo } = useBranding();
  // null for orgs with no attendance-based membership gate -- the progress bar
  // is skipped entirely in that case rather than showing a meaningless 0 target.
  const threshold = membershipThreshold(orgSlug);

  useEffect(() => {
    if (!isLoaded) return;

    const init = async () => {
      if (!user) {
        router.push("/");
        return;
      }

      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("id, name, slug")
        .eq("slug", orgSlug)
        .single();

      // Distinguish "no such club" from "the query failed". Collapsing both
      // into "Club does not exist" hides auth/permission errors -- an invalid
      // API key or a denying RLS policy both look like a missing org, which
      // sends you hunting in the database for a row that is actually there.
      if (orgError) {
        console.error("Organization lookup failed:", orgError);
        setError(`Couldn't load this club: ${orgError.message}`);
        setLoading(false);
        return;
      }

      if (!org) {
        setError("Club does not exist");
        setLoading(false);
        return;
      }

      setOrganization(org);

      const { data: attendee } = await supabase
        .from("attendees")
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
  }, [orgSlug, isLoaded, user, supabase, router]);

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
            Club
          </h1>
          <p className="text-white/90 text-base sm:text-lg">Powered by ACM</p>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-5 sm:p-8 w-full max-w-sm border border-white/20">
          <p className="text-white text-center text-lg sm:text-xl">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-var(--org-nav-h))] px-4 py-8 sm:px-6">
      <div className="text-center mb-6 sm:mb-8">
        <Image
          src={logo.crest}
          alt={`${organization.name} logo`}
          width={96}
          height={96}
          className="mx-auto mb-4 h-20 w-20 object-contain drop-shadow-md sm:h-24 sm:w-24"
          priority
          unoptimized
        />
        <h1 className="text-3xl font-bold text-white mb-2 wrap-break-word sm:text-4xl md:text-5xl">
          {organization.name}
        </h1>
        <p className="text-white/90 text-base sm:text-lg">Powered by ACM</p>
      </div>

      {/* Status panel. Check In / Stats used to live here as buttons, but the
          OrgNav bar now carries them on every page -- duplicating them here
          just gave the same two destinations twice on one screen. */}
      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-5 sm:p-8 w-full max-w-sm border border-white/20">
        <p className="text-center text-xs font-semibold tracking-widest text-white/50 uppercase">
          Your attendance
        </p>
        <p className="mt-3 text-center">
          <span className="text-4xl font-bold text-white sm:text-5xl">
            {attendanceCount}
          </span>
          <span className="ml-2 text-sm text-white/60">
            {attendanceCount === 1 ? "meeting" : "meetings"}
          </span>
        </p>

        {/* Progress toward membership, when the org actually has a threshold.
            membershipThreshold returns null for unconfigured orgs -- those get
            the plain count above and nothing else. */}
        {threshold !== null && (
          <div className="mt-5">
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-white/15"
              role="progressbar"
              aria-valuenow={Math.min(attendanceCount, threshold)}
              aria-valuemin={0}
              aria-valuemax={threshold}
              aria-label="Progress toward membership"
            >
              <div
                className="h-full rounded-full bg-brand-action transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, (attendanceCount / threshold) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-2.5 text-center text-sm text-white/70">
              {attendanceCount >= threshold ? (
                <span className="font-semibold text-emerald-200">
                  You're a member
                </span>
              ) : (
                <>
                  <span className="font-semibold text-white">
                    {threshold - attendanceCount} more
                  </span>{" "}
                  to become a member
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { createClient } from "../utils/supabase/client";
import { hasLogo } from "@/lib/branding";
import { useBranding } from "@/app/components/BrandingProvider";
import Link from "next/link";
import { membershipThreshold } from "@/lib/membership";
import {
  Eyebrow,
  Identity,
  Meter,
  Spinner,
  buttonClass,
} from "@/components/ui/primitives";

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
      <div className="flex min-h-[calc(100dvh-var(--org-nav-h))] items-center justify-center gap-3">
        <Spinner size={26} />
        <span className="text-sm text-ink-faint">Loading…</span>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-var(--org-nav-h))] w-full max-w-md flex-col justify-center px-5 py-8">
        <div className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-6">
          <Eyebrow>Org not found</Eyebrow>
          <p className="m-0 text-[17px] font-bold text-ink">No org at /{orgSlug}</p>
          <p className="m-0 text-[13.5px] leading-relaxed text-ink-muted">
            {error ?? "Check the link or scan the QR again."}
          </p>
        </div>
      </div>
    );
  }

  const isMember = threshold !== null && attendanceCount >= threshold;

  return (
    <div className="mx-auto w-full max-w-md">
      {/* Identity block. The crest, name and description are the club; the two
          actions sit directly under them because this page's only job is to
          send someone onward. */}
      <div className="flex flex-col gap-4 border-b border-line-soft px-6 pt-5 pb-6">
        {/* No logo uploaded -> the initial tile stands in. An empty src would
            resolve to the page's own URL and request the HTML as an image. */}
        {hasLogo(logo.crest) ? (
          <Image
            src={logo.crest}
            alt={`${organization.name} logo`}
            width={96}
            height={96}
            className="size-[54px] rounded-lg object-contain"
            priority
            unoptimized
          />
        ) : (
          <Identity
            label={organization.name.charAt(0).toUpperCase()}
            size="lg"
            solid
          />
        )}

        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[27px] font-bold tracking-[-0.025em] text-ink wrap-break-word">
            {organization.name}
          </h1>
          <p className="m-0 text-[14.5px] leading-relaxed text-ink-muted">
            Powered by ACM
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/${orgSlug}/checkin`}
            className={buttonClass("primary", "md", "flex-1")}
          >
            Check in
          </Link>
          <Link
            href={`/${orgSlug}/stats`}
            className={buttonClass("secondary", "md")}
          >
            My stats
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-6 py-6">
        <Eyebrow>Your attendance</Eyebrow>

        {/* Progress toward membership, when the org actually has a threshold.
            membershipThreshold returns null for unconfigured orgs -- those get
            the plain count and nothing else. */}
        {threshold !== null ? (
          <div className="flex flex-col gap-2.5 rounded-card border border-line p-5">
            <p className="m-0 text-base font-bold text-ink">
              {attendanceCount} of {threshold} meetings
            </p>
            <Meter value={attendanceCount} max={threshold} />
            <p className="m-0 text-[13.5px] leading-relaxed text-ink-muted">
              {isMember ? (
                <span className="font-semibold text-good-ink">
                  Threshold met — you&apos;re a member.
                </span>
              ) : (
                <>
                  Attend {threshold - attendanceCount} more this term to become a
                  member and get voting rights.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 rounded-card border border-line p-5">
            <p className="m-0 text-[26px] font-bold tracking-[-0.02em] text-ink tabular-nums">
              {attendanceCount}
            </p>
            <p className="m-0 text-[13.5px] text-ink-muted">
              {attendanceCount === 1 ? "meeting" : "meetings"} attended
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

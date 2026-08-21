"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { createClient } from "@/app/utils/supabase/client";

// Fixed, always-reachable link to /developer for global admins. Mounted once
// in the root layout (app/layout.tsx) rather than per-page -- the old entry
// point (the dashboard's profile dropdown) only existed on /dashboard, which
// isn't "any screen" as requested.
export default function DeveloperShortcut() {
  const { user, isLoaded } = useUser();
  const pathname = usePathname();
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!isLoaded || !user) {
        if (!cancelled) setIsGlobalAdmin(false);
        return;
      }

      const { data, error } = await createClient()
        .from("attendees")
        .select("admin")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error("Admin flag lookup failed:", error);
        return;
      }
      setIsGlobalAdmin(Boolean(data?.admin));
    };

    check();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, user]);

  if (!isGlobalAdmin || pathname === "/developer") return null;

  return (
    <Link
      href="/developer"
      aria-label="Developer console"
      title="Developer console"
      className="fixed bottom-4 right-4 z-[60] flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
    >
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M8 9l-4 3 4 3M16 9l4 3-4 3M14 6l-4 12" />
      </svg>
    </Link>
  );
}

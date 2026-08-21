"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";

import { createClient } from "@/app/utils/supabase/client";
import { useBranding } from "@/app/components/BrandingProvider";
import { cn } from "@/lib/utils";

// Persistent per-org navigation. Rendered by app/[orgSlug]/layout.tsx for every
// page under an org, which replaces the old pattern of each page being a dead
// end with no way back out.
//
// Deliberately NOT rendered on the admin dashboard -- that route ships its own
// full-page shell (brand sidebar + sticky light header), and stacking this bar
// on top would give it two competing headers. Admin gets an "Exit to club"
// link inside its own sidebar instead. See the pathname guard below.
//
// Check-in is a public route, so this component must render correctly for a
// signed-out guest: no member-only tabs, and the crest links to the club page
// rather than /dashboard, which a guest cannot reach.

type NavTab = { href: string; label: string };

export default function OrgNav() {
  const { name, slug, logo } = useBranding();
  const { user, isLoaded } = useUser();
  const pathname = usePathname();
  const supabase = createClient();

  // Whether this user is a global admin or holds a non-member role in THIS
  // org -- gates the Admin tab. Only ever set from the async lookup below;
  // the signed-out case needs no state, since `user` already tells us in render.
  const [hasAdminRole, setHasAdminRole] = useState(false);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);

  useEffect(() => {
    if (!isLoaded || !user) return;

    let cancelled = false;

    const resolveRole = async () => {
      const { data: org } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      const { data: attendee } = await supabase
        .from("attendees")
        .select("admin")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!org) return;

      const { data: membership } = await supabase
        .from("memberships")
        .select("role")
        .eq("org_id", org.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      const role = membership?.role?.toLowerCase();
      const globalAdmin = Boolean(attendee?.admin);
      const orgAdmin = Boolean(role && role !== "member");

      setIsGlobalAdmin(globalAdmin);
      setHasAdminRole(globalAdmin || orgAdmin);
    };

    // A failed lookup simply leaves the Admin tab hidden -- officers can still
    // reach it from /dashboard, and showing a tab that 403s is worse.
    resolveRole().catch(() => {
      if (cancelled) return;
      setIsGlobalAdmin(false);
      setHasAdminRole(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, user, slug, supabase]);

  // The admin dashboard owns its own chrome -- render nothing there.
  if (pathname?.startsWith(`/${slug}/admin-dashboard`)) return null;

  const tabs: NavTab[] = [
    { href: `/${slug}/checkin`, label: "Check In" },
    // Stats reads the caller's own attendance, so it's meaningless signed out.
    ...(user ? [{ href: `/${slug}/stats`, label: "Stats" }] : []),
    ...(user && (hasAdminRole || isGlobalAdmin)
      ? [{ href: `/${slug}/admin-dashboard`, label: "Admin" }]
      : []),
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <header className="sticky top-0 z-40 border-b border-white/15 bg-brand-background/80 backdrop-blur-md">
      <nav
        aria-label={`${name || "Club"} navigation`}
        className="mx-auto flex w-full max-w-5xl items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-6 sm:py-3"
      >
        {/* "All clubs" sits OUTSIDE the tab group on purpose: the tabs are
            pages within this org, whereas /dashboard is the cross-org list one
            level up. Rendering it as a fourth tab would read as another org
            page. Signed-out guests don't get it -- /dashboard is behind auth
            and would just bounce them to sign-in. */}
        {user && (
          <Link
            href="/dashboard"
            aria-label="All clubs"
            className="-ml-1 flex flex-none items-center gap-1.5 rounded-lg px-1.5 py-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
          >
            <svg
              className="h-4 w-4 flex-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            {/* Visual label only -- hidden on phones, where the chevron alone
                reads as "back out". aria-hidden because the link already
                carries this text as its aria-label. */}
            <span
              aria-hidden="true"
              className="hidden text-xs font-semibold sm:inline"
            >
              All clubs
            </span>
          </Link>
        )}

        {/* Crest + name → the club home. */}
        <Link
          href={`/${slug}`}
          className="flex min-w-0 items-center gap-2 rounded-lg py-1 pr-2 transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
        >
          <Image
            src={logo.crest}
            alt=""
            width={32}
            height={32}
            className="h-7 w-7 flex-none object-contain sm:h-8 sm:w-8"
            unoptimized
          />
          {/* The name is the first thing to go when space is tight -- the tabs
              are the functional part of this bar. */}
          <span className="hidden truncate text-sm font-bold text-white xs:inline sm:text-base">
            {name || "Club"}
          </span>
        </Link>

        {/* Tabs sit right-aligned and scroll horizontally if a long org name
            plus three tabs ever outgrow a narrow phone. */}
        <div className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-1.5 [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive(tab.href) ? "page" : undefined}
              className={cn(
                "flex-none rounded-full px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none sm:px-4 sm:text-sm",
                isActive(tab.href)
                  ? "bg-white text-brand-background"
                  : "text-white/75 hover:bg-white/10 hover:text-white",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}

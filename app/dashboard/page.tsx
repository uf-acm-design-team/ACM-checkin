"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SignOutButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { createClient } from "../utils/supabase/client";
import {
  Card,
  Chip,
  EmptyState,
  Identity,
  Skeleton,
  Spinner,
  buttonClass,
} from "@/components/ui/primitives";

// Shape of the memberships rows joined to organizations. PostgREST types the
// embedded relation loosely, so this is asserted at the call site.
interface MembershipRow {
  role: string | null;
  organizations: Organization | null;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export default function Dashboard() {
  const { user, isLoaded } = useUser();
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [attendanceByOrg, setAttendanceByOrg] = useState<Record<string, number>>({});
  const [roleByOrg, setRoleByOrg] = useState<Record<string, string>>({});
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(false);
  }, [isLoaded, user]);

  // Gates the "Developer" item in the profile menu below -- same flag
  // admin-dashboard and /developer itself check.
  useEffect(() => {
    if (!isLoaded || !user) return;
    supabase
      .from("attendees")
      .select("admin")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("Admin flag lookup failed:", error);
          return;
        }
        setIsGlobalAdmin(Boolean(data?.admin));
      });
  }, [isLoaded, user, supabase]);

  useEffect(() => {
    if (loading || !user) {
      setAttendanceByOrg({});
      setOrgsLoading(false);
      return;
    }

    const fetchMemberships = async () => {
      try {
        const { data, error } = await supabase
          .from("memberships")
          .select("role, organizations:org_id(id, name, slug, created_at)")
          .eq("user_id", user.id);

        if (error) {
          console.error("Error fetching memberships:", JSON.stringify(error, null, 2));
        } else {
          const rows = (data ?? []) as unknown as MembershipRow[];
          const orgs = rows
            .map((m) => m.organizations)
            .filter((o): o is Organization => Boolean(o))
            .sort((a, b) => a.name.localeCompare(b.name));
          setOrganizations(orgs);

          // Track the caller's role per org so the card can offer an admin
          // link only where they can actually use it.
          const roles: Record<string, string> = {};
          for (const m of rows) {
            if (m.organizations?.id && m.role) {
              roles[m.organizations.id] = m.role;
            }
          }
          setRoleByOrg(roles);

          const { data: attendee, error: attendeeError } = await supabase
            .from("attendees")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();

          if (attendeeError) {
            console.error("Error fetching attendee:", attendeeError);
          }

          if (attendee?.id) {
            const { data: attendanceRows, error: attendanceError } = await supabase
              .from("attendance")
              .select("org_id")
              .eq("attendee_id", attendee.id);

            if (attendanceError) {
              console.error("Error fetching attendance:", attendanceError);
            } else {
              const counts = (attendanceRows || []).reduce(
                (acc: Record<string, number>, row: { org_id: string }) => {
                  acc[row.org_id] = (acc[row.org_id] || 0) + 1;
                  return acc;
                },
                {}
              );
              setAttendanceByOrg(counts);
            }
          } else {
            setAttendanceByOrg({});
          }
        }
      } catch (err) {
        console.error("Unexpected error fetching organizations:", err);
      } finally {
        setOrgsLoading(false);
      }
    };

    fetchMemberships();
  }, [user, loading, supabase]);

  const displayName =
    user?.fullName || user?.primaryEmailAddress?.emailAddress || "Profile";
  const initials = (user?.firstName?.[0] || user?.fullName?.[0] || "U").toUpperCase();

  if (!isLoaded || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-3">
        <Spinner size={26} />
        <span className="text-sm text-ink-faint">Loading…</span>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-6 sm:px-6">
      {/* Heading + account menu. The wireframe leads with "Your orgs" rather
          than a product title: someone who is signed in already knows what app
          they are in, and the list is what they came for. */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="m-0 text-[22px] font-bold tracking-[-0.02em] text-ink">
          Your orgs
        </h1>

        <div className="relative flex-none">
          <button
            type="button"
            onClick={() => setProfileMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={profileMenuOpen}
            aria-label={`Account menu for ${displayName}`}
            className="flex size-[34px] cursor-pointer items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent-on-soft transition-colors hover:bg-accent-soft/70"
          >
            {initials}
          </button>

          {profileMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-card border border-line bg-surface shadow-[var(--shadow-card)]"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileMenuOpen(false);
                  router.push("/settings");
                }}
                className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left text-sm font-medium text-ink-strong transition-colors hover:bg-surface-sunken"
              >
                <span>Settings</span>
                <span aria-hidden="true">→</span>
              </button>
              {isGlobalAdmin && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    router.push("/developer");
                  }}
                  className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left text-sm font-medium text-ink-strong transition-colors hover:bg-surface-sunken"
                >
                  <span>Developer</span>
                  <span aria-hidden="true">→</span>
                </button>
              )}
              <div className="h-px bg-line-soft" />
              <SignOutButton signOutOptions={{ redirectUrl: "/sign-in" }}>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left text-sm font-medium text-bad transition-colors hover:bg-bad-surface"
                >
                  <span>Log out</span>
                  <span aria-hidden="true">↩</span>
                </button>
              </SignOutButton>
            </div>
          )}
        </div>
      </div>

      {orgsLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Card key={i} className="flex flex-col gap-3.5 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-11 w-full" />
            </Card>
          ))}
        </div>
      ) : organizations.length > 0 ? (
        <div className="flex flex-col gap-3">
          {organizations.map((org) => {
            const attended = attendanceByOrg[org.id] || 0;
            const role = roleByOrg[org.id]?.toLowerCase();
            const isOfficer = Boolean(role && role !== "member");

            return (
              <Card key={org.id} className="flex flex-col gap-3.5 p-4">
                <div className="flex items-center gap-3">
                  <Identity label={org.name.charAt(0).toUpperCase()} size="md" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-base font-bold text-ink">
                      {org.name}
                    </span>
                    <span className="text-[13px] text-ink-faint">
                      {attended} {attended === 1 ? "meeting" : "meetings"} attended
                    </span>
                  </div>
                  {/* The role chip is identity, not status -- an officer wants
                      to see at a glance which clubs they run. */}
                  {isOfficer && <Chip tone="accent">{role}</Chip>}
                </div>

                <div className="flex gap-2">
                  <Link
                    href={`/${org.slug}/checkin`}
                    className={buttonClass("primary", "sm", "flex-1")}
                  >
                    Check in
                  </Link>
                  <Link
                    href={`/${org.slug}/stats`}
                    className={buttonClass("secondary", "sm")}
                  >
                    Stats
                  </Link>
                  {/* Officers/owners/admins only -- a plain member has nothing
                      to do there. */}
                  {isOfficer && (
                    <Link
                      href={`/${org.slug}/admin-dashboard`}
                      className={buttonClass("secondary", "sm")}
                    >
                      Admin
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* First run. The wireframe's argument: this is not an error and not a
           dead end -- say how orgs get here, and offer the one action that
           does it. */
        <EmptyState
          title="You'll see orgs here after your first check-in"
          action={
            <Link href="/" className={buttonClass("primary", "md")}>
              Find an org
            </Link>
          }
        >
          Scan the QR at a meeting, or open the link an officer sent you.
          Membership and stats start counting from that moment.
        </EmptyState>
      )}
    </div>
  );
}

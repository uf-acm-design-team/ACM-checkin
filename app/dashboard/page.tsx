"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SignOutButton, useUser } from "@clerk/nextjs";
import { createClient } from "../utils/supabase/client";

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

  if (!isLoaded || loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4 py-8 sm:px-6">
      <div className="text-center mb-6 sm:mb-8">
        <h1 className="text-3xl font-bold text-white mb-2 sm:text-4xl md:text-5xl">
          UF Check-In
        </h1>
        <p className="text-white/90 text-base sm:text-lg">Powered by ACM</p>
      </div>

      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-5 sm:p-8 w-full max-w-2xl border border-white/20">
        <div className="flex items-start justify-between gap-3 mb-6 sm:mb-8">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white mb-1.5 sm:text-2xl md:text-3xl sm:mb-2">
              Welcome to your Dashboard!
            </h2>
            <p className="text-white/80 text-sm sm:text-base">
              You're logged in as{" "}
              <span className="font-semibold break-all">
                {user?.fullName || user?.primaryEmailAddress?.emailAddress}
              </span>
            </p>
          </div>
          <div className="relative flex-none">
            <button
              type="button"
              onClick={() => setProfileMenuOpen((open) => !open)}
              className="flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-2.5 py-2 text-left text-white shadow-lg transition hover:bg-white/15"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-action text-sm font-bold text-white">
                {(user?.firstName?.[0] || user?.fullName?.[0] || "U").toUpperCase()}
              </div>
              <span className="max-w-32 truncate text-sm font-semibold sm:max-w-48">
                {user?.fullName || user?.primaryEmailAddress?.emailAddress || "Profile"}
              </span>
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className={`h-4 w-4 transition-transform ${profileMenuOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              >
                <path d="M5 7.5L10 12.5L15 7.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {profileMenuOpen && (
              <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-white/20 bg-slate-900/95 shadow-2xl backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    router.push("/settings");
                  }}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-white transition hover:bg-white/10"
                >
                  <span>Settings</span>
                  <span aria-hidden="true">→</span>
                </button>
                {isGlobalAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      router.push("/developer");
                    }}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-white transition hover:bg-white/10"
                  >
                    <span>Developer</span>
                    <span aria-hidden="true">→</span>
                  </button>
                )}
                <div className="h-px bg-white/10" />
                <SignOutButton signOutOptions={{ redirectUrl: "/sign-in" }}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-red-200 transition hover:bg-red-500/10"
                  >
                    <span>Log out</span>
                    <span aria-hidden="true">↩</span>
                  </button>
                </SignOutButton>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white/10 rounded-lg p-4 sm:p-6 border border-white/20">
            <h3 className="text-xl font-semibold text-white mb-4">
              Your Organizations
            </h3>
            {orgsLoading ? (
              <p className="text-white/70">Loading organizations...</p>
            ) : organizations.length > 0 ? (
              <div className="space-y-3">
                {organizations.map((org) => (
                  <div
                    key={org.id}
                    onClick={() => router.push(`/${org.slug}`)}
                    className="bg-white/10 rounded-lg p-4 border border-white/20 hover:bg-white/20 transition-all cursor-pointer"
                  >
                    {/* Stacks on mobile: three side-by-side buttons in a
                        right-aligned column overflow a phone's width. */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <h4 className="text-lg font-semibold text-white wrap-break-word">
                          {org.name}
                        </h4>
                        <p className="text-white/60 text-sm">@{org.slug}</p>
                      </div>
                      <div className="flex flex-col gap-2 sm:items-end">
                        <p className="text-white/70 text-sm sm:whitespace-nowrap sm:text-right">
                          Attended {attendanceByOrg[org.id] || 0}{" "}
                          {(attendanceByOrg[org.id] || 0) === 1
                            ? "meeting"
                            : "meetings"}
                        </p>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/${org.slug}/checkin`);
                            }}
                            className="flex-1 bg-white text-black font-semibold py-2 px-4 rounded-lg hover:bg-white/90 transition-all cursor-pointer sm:flex-none"
                          >
                            Check In
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/${org.slug}/stats`);
                            }}
                            className="flex-1 bg-white/15 hover:bg-white/25 text-white font-semibold py-2 px-4 rounded-lg transition-all border border-white/20 cursor-pointer sm:flex-none"
                          >
                            Stats
                          </button>
                          {/* Officers/owners/admins only -- the dashboard is
                              gated on membership anyway, but a plain member has
                              nothing to do there. */}
                          {roleByOrg[org.id] &&
                            roleByOrg[org.id].toLowerCase() !== "member" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/${org.slug}/admin-dashboard`);
                                }}
                                className="flex-1 bg-brand-action hover:opacity-90 text-white font-semibold py-2 px-4 rounded-lg transition-opacity cursor-pointer sm:flex-none"
                              >
                                Admin
                              </button>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-white/70">No organizations found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

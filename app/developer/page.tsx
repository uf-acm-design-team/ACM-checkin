"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { createClient } from "../utils/supabase/client";
import { DEFAULT_BRANDING } from "@/lib/branding";
import AuditLogView from "@/app/components/AuditLogView";

// Platform-admin console: organization creation (moved out of the
// admin-dashboard's old Orgs tab, which lived awkwardly inside one specific
// org's dashboard despite being a platform-level action) and the platform
// audit log (org.created/deleted, admin.granted/revoked -- see
// 20260823000000_audit_log_schema.sql). Global-admin only (attendees.admin),
// gated client-side the same way admin-dashboard and settings gate
// themselves -- there's no middleware.ts in this repo, every privileged
// route checks itself.

interface Organization {
  id: string;
  name: string;
  slug: string;
}

const EMPTY_ORG_DRAFT = {
  name: "",
  slug: "",
  ownerEmail: "",
  colorPrimary: DEFAULT_BRANDING.colors.primary,
  colorBackground: DEFAULT_BRANDING.colors.background,
  colorBackgroundSecondary: DEFAULT_BRANDING.colors.backgroundSecondary,
  colorAccent: DEFAULT_BRANDING.colors.accent,
  colorText: DEFAULT_BRANDING.colors.text,
  particleColor: DEFAULT_BRANDING.particleColor,
};
type OrgDraft = typeof EMPTY_ORG_DRAFT;

const ORG_COLOR_FIELDS = [
  { key: "colorPrimary", label: "Primary" },
  { key: "colorBackground", label: "Background" },
  { key: "colorBackgroundSecondary", label: "Background (secondary)" },
  { key: "colorAccent", label: "Accent" },
  { key: "colorText", label: "Text" },
  { key: "particleColor", label: "Particles" },
] as const satisfies ReadonlyArray<{ key: keyof OrgDraft; label: string }>;

const TABS = [
  { key: "orgs", label: "Organizations" },
  { key: "audit-log", label: "Audit Log" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function DeveloperPage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [adminCheckFinished, setAdminCheckFinished] = useState(false);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("orgs");

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [orgDraft, setOrgDraft] = useState<OrgDraft>(EMPTY_ORG_DRAFT);
  const [orgCrestFile, setOrgCrestFile] = useState<File | null>(null);
  const [orgWordmarkFile, setOrgWordmarkFile] = useState<File | null>(null);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.push("/sign-in");
    }
  }, [isLoaded, user, router]);

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
        }
        setIsGlobalAdmin(Boolean(data?.admin));
        setAdminCheckFinished(true);
      });
  }, [isLoaded, user, supabase]);

  useEffect(() => {
    if (adminCheckFinished && !isGlobalAdmin) {
      router.replace("/dashboard");
    }
  }, [adminCheckFinished, isGlobalAdmin, router]);

  const fetchOrgs = useCallback(async () => {
    setOrgsLoading(true);
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, slug")
        .order("name");
      if (error) {
        console.error("Error fetching organizations:", error);
      } else {
        setOrgs(data || []);
      }
    } finally {
      setOrgsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (isGlobalAdmin) fetchOrgs();
  }, [isGlobalAdmin, fetchOrgs]);

  // Server-side re-checks attendees.admin itself using the service role, so
  // this isn't relying on the client for authorization, only for UX.
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreatingOrg(true);
    setOrgError(null);

    try {
      const token = await getToken();
      if (!token) {
        setOrgError("You must be signed in to create an organization.");
        return;
      }

      const body = new FormData();
      body.set("name", orgDraft.name);
      body.set("slug", orgDraft.slug);
      body.set("owner_email", orgDraft.ownerEmail);
      body.set("color_primary", orgDraft.colorPrimary);
      body.set("color_background", orgDraft.colorBackground);
      body.set("color_background_secondary", orgDraft.colorBackgroundSecondary);
      body.set("color_accent", orgDraft.colorAccent);
      body.set("color_text", orgDraft.colorText);
      body.set("particle_color", orgDraft.particleColor);
      if (orgCrestFile) body.set("crest", orgCrestFile);
      if (orgWordmarkFile) body.set("wordmark", orgWordmarkFile);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-org`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
          },
          body,
        },
      );

      const result = await response.json();
      if (!response.ok) {
        setOrgError(result?.error ?? "Failed to create organization.");
        return;
      }

      setShowOrgModal(false);
      setOrgDraft(EMPTY_ORG_DRAFT);
      setOrgCrestFile(null);
      setOrgWordmarkFile(null);
      fetchOrgs();
    } catch {
      setOrgError("Failed to create organization.");
    } finally {
      setCreatingOrg(false);
    }
  };

  if (!isLoaded || !adminCheckFinished || !isGlobalAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <div className="text-xl text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <div className="text-lg font-extrabold sm:text-xl">Developer</div>
            <div className="text-xs font-medium text-slate-500">
              Platform administration
            </div>
          </div>
          <Link
            href="/dashboard"
            className="text-sm font-semibold text-brand-background hover:underline"
          >
            ← All clubs
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-8">
        <div className="mb-5 flex gap-1.5 rounded-[10px] bg-slate-100 p-1 sm:w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 cursor-pointer rounded-lg px-4 py-2 text-[13px] font-bold transition-all sm:flex-none ${
                activeTab === tab.key
                  ? "bg-white text-brand-background shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "orgs" && (
          <>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="text-sm font-semibold text-slate-500">
                All organizations on the platform.
              </div>
              <button
                onClick={() => {
                  setOrgError(null);
                  setShowOrgModal(true);
                }}
                className="w-full cursor-pointer rounded-[9px] bg-brand-action px-4.5 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 sm:w-auto"
              >
                + New Org
              </button>
            </div>

            <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
              <div className="hidden grid-cols-[2.6fr_1.6fr_120px] gap-4 border-b border-slate-200 px-5 py-3.5 text-xs font-bold tracking-wide text-slate-500 uppercase sm:grid">
                <div>Organization</div>
                <div>Slug</div>
                <div></div>
              </div>
              {orgsLoading ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  Loading organizations...
                </div>
              ) : orgs.length > 0 ? (
                orgs.map((org) => (
                  <div
                    key={org.id}
                    className="flex flex-col gap-2 border-b border-slate-100 px-4 py-4 text-sm last:border-b-0 sm:grid sm:grid-cols-[2.6fr_1.6fr_120px] sm:items-center sm:gap-4 sm:px-5"
                  >
                    <div className="font-bold wrap-break-word">{org.name}</div>
                    <div className="font-semibold text-slate-600">@{org.slug}</div>
                    <div className="flex sm:justify-end">
                      <button
                        onClick={() => router.push(`/${org.slug}/admin-dashboard`)}
                        className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-brand-background transition-all hover:bg-slate-50"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-10 text-center text-sm text-slate-500">
                  No organizations yet.
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "audit-log" && (
          <AuditLogView
            scope="platform"
            emptyMessage="No platform-level activity recorded yet."
          />
        )}
      </main>

      {/* NEW ORG MODAL */}
      {showOrgModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-4"
          onClick={() => setShowOrgModal(false)}
        >
          <form
            onSubmit={handleCreateOrg}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:w-110 sm:max-w-[92vw] sm:rounded-2xl sm:p-7"
          >
            <div className="mb-4 text-lg font-extrabold">New Organization</div>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">
                  Organization Name
                </label>
                <input
                  type="text"
                  required
                  value={orgDraft.name}
                  onChange={(e) => setOrgDraft({ ...orgDraft, name: e.target.value })}
                  placeholder="Organization Name"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">
                  Slug
                </label>
                <input
                  type="text"
                  required
                  value={orgDraft.slug}
                  onChange={(e) => setOrgDraft({ ...orgDraft, slug: e.target.value })}
                  placeholder="e.g. acm"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">
                  Owner email
                </label>
                <input
                  type="email"
                  required
                  value={orgDraft.ownerEmail}
                  onChange={(e) =>
                    setOrgDraft({ ...orgDraft, ownerEmail: e.target.value })
                  }
                  placeholder="owner@ufl.edu"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-500">
                  Branding
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {ORG_COLOR_FIELDS.map((field) => (
                    <div key={field.key} className="flex flex-col items-center gap-1">
                      <input
                        type="color"
                        value={orgDraft[field.key]}
                        onChange={(e) =>
                          setOrgDraft({ ...orgDraft, [field.key]: e.target.value })
                        }
                        className="h-9 w-full cursor-pointer rounded-md border border-slate-200"
                      />
                      <span className="text-center text-[11px] font-semibold text-slate-500">
                        {field.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-500">
                    Crest logo
                  </label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => setOrgCrestFile(e.target.files?.[0] ?? null)}
                    className="w-full text-xs text-slate-500 file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-100 file:px-2.5 file:py-1.5 file:text-xs file:font-bold"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-500">
                    Wordmark logo
                  </label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => setOrgWordmarkFile(e.target.files?.[0] ?? null)}
                    className="w-full text-xs text-slate-500 file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-100 file:px-2.5 file:py-1.5 file:text-xs file:font-bold"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Logos are optional -- leave blank to use the default ACM mark.
              </p>

              {orgError && <p className="text-sm text-red-600">{orgError}</p>}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowOrgModal(false);
                  setOrgDraft(EMPTY_ORG_DRAFT);
                  setOrgCrestFile(null);
                  setOrgWordmarkFile(null);
                  setOrgError(null);
                }}
                className="cursor-pointer rounded-[9px] border border-slate-200 bg-white px-4.5 py-2.5 text-[13px] font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingOrg}
                className="cursor-pointer rounded-[9px] bg-brand-action px-4.5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {creatingOrg ? "Creating..." : "Create Organization"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

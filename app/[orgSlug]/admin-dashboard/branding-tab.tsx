"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { inkOn, type Branding } from "@/lib/branding";

// Edits an existing org's branding via the update-org-branding edge function
// (logo uploads need the service role -- see that function's header comment).
// Mirrors the color-picker fields from the old org-creation modal
// (admin-dashboard/page.tsx's EMPTY_ORG_DRAFT/ORG_COLOR_FIELDS), pre-filled
// from the org's current branding instead of the ACM defaults.

// Accent leads because it is the only stored colour that still paints anything:
// the app runs on one fixed design system (white surfaces, slate text) and an
// org's accent is applied on the check-in screen alone. The rest are kept so a
// club's saved palette survives a round-trip through this form, but they are
// grouped separately and labelled as inactive rather than presented as live
// controls -- a picker that changes nothing visible is worse than no picker.
const ACCENT_FIELD = { key: "accent", label: "Accent" } as const;

const STORED_FIELDS = [
  { key: "primary", label: "Primary" },
  { key: "background", label: "Background" },
  { key: "backgroundSecondary", label: "Background (secondary)" },
  { key: "text", label: "Text" },
] as const;

interface BrandingTabProps {
  orgId: string;
  branding: Branding;
  onSaved: (branding: Branding) => void;
}

export default function BrandingTab({ orgId, branding, onSaved }: BrandingTabProps) {
  const { getToken } = useAuth();
  const router = useRouter();

  const [colors, setColors] = useState(branding.colors);
  const [crestFile, setCrestFile] = useState<File | null>(null);
  const [wordmarkFile, setWordmarkFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const token = await getToken();
      if (!token) {
        setError("You must be signed in to edit branding.");
        return;
      }

      const body = new FormData();
      body.set("org_id", orgId);
      body.set("color_primary", colors.primary);
      body.set("color_background", colors.background);
      body.set("color_background_secondary", colors.backgroundSecondary);
      body.set("color_accent", colors.accent);
      body.set("color_text", colors.text);
      // Particles no longer render, but the edge function still expects this
      // field -- send the stored value back unchanged rather than blanking it.
      body.set("particle_color", branding.particleColor);
      if (crestFile) body.set("crest", crestFile);
      if (wordmarkFile) body.set("wordmark", wordmarkFile);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-org-branding`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
          },
          body,
        },
      );

      // A non-2xx from a route that doesn't exist yet (function not deployed)
      // or a gateway-level rejection returns HTML/plain text, not JSON --
      // response.json() would throw and land in the catch block below with no
      // indication of why. Parse defensively so the real cause is visible.
      let result: { error?: string; organization?: { branding: unknown } } | null = null;
      try {
        result = await response.json();
      } catch (parseErr) {
        console.error(
          "update-org-branding: non-JSON response",
          response.status,
          response.statusText,
          parseErr,
        );
      }

      if (!response.ok) {
        setError(
          result?.error ??
            `Failed to update branding (HTTP ${response.status} ${response.statusText}). Check that the update-org-branding function is deployed.`,
        );
        return;
      }

      if (!result?.organization) {
        setError("Branding update returned an unexpected response.");
        return;
      }

      setCrestFile(null);
      setWordmarkFile(null);
      setSuccess(true);
      onSaved(result.organization.branding as Branding);

      // The colours and the org logo do NOT come from React state: OrgTheme is
      // a server component that fetches branding and emits
      // <style>:root{...}</style> plus the BrandingProvider context. A client
      // setState cannot change either, so without this the page keeps the old
      // theme until a full reload -- the save appears to have done nothing.
      // router.refresh() re-runs the server layout and re-emits both.
      router.refresh();
    } catch (err) {
      console.error("update-org-branding request failed:", err);
      setError("Failed to update branding. See the browser console for details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl rounded-card border border-line bg-surface p-5 sm:p-7">
      <div className="mb-1 text-lg font-bold tracking-[-0.02em]">Branding</div>
      <p className="mb-5 text-[13px] leading-relaxed text-ink-muted">
        Your accent colour and logos. The accent is used on your check-in screen
        — on its primary button, selected options and crest tile. The rest of the
        app runs on one shared design system so that officers see a consistent
        console and warnings stay readable on every palette.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="branding-accent"
            className="text-[13px] font-semibold text-ink-strong"
          >
            Accent colour
          </label>
          <div className="flex items-center gap-3">
            <input
              id="branding-accent"
              type="color"
              value={colors[ACCENT_FIELD.key]}
              onChange={(e) =>
                setColors({ ...colors, [ACCENT_FIELD.key]: e.target.value })
              }
              className="h-11 w-16 flex-none cursor-pointer rounded-control border border-line"
            />
            {/* A live sample of the one thing this control actually changes.
                The ink on the swatch is derived, not assumed white, so a light
                accent previews as the legible button it will really be. */}
            <span
              className="inline-flex items-center rounded-control px-4 py-2.5 text-sm font-semibold"
              style={{
                background: colors[ACCENT_FIELD.key],
                color: inkOn(colors[ACCENT_FIELD.key]),
              }}
            >
              Check in
            </span>
            <span className="font-mono text-xs text-ink-faint uppercase">
              {colors[ACCENT_FIELD.key]}
            </span>
          </div>
        </div>

        {/* Stored but not painted. Kept editable so a club that later gets a
            themed surface doesn't lose the palette it already chose. */}
        <details className="rounded-card border border-line p-3.5">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink-strong">
            Other stored colours (not currently shown anywhere)
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {STORED_FIELDS.map((field) => (
              <div key={field.key} className="flex flex-col items-center gap-1">
                <input
                  type="color"
                  aria-label={field.label}
                  value={colors[field.key]}
                  onChange={(e) =>
                    setColors({ ...colors, [field.key]: e.target.value })
                  }
                  className="h-9 w-full cursor-pointer rounded-md border border-line"
                />
                <span className="text-center text-[11px] font-semibold text-ink-faint">
                  {field.label}
                </span>
              </div>
            ))}
          </div>
        </details>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-ink-muted">
              Crest logo
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => setCrestFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-ink-muted file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface-sunken file:px-2.5 file:py-1.5 file:text-xs file:font-bold"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-ink-muted">
              Wordmark logo
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => setWordmarkFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-ink-muted file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface-sunken file:px-2.5 file:py-1.5 file:text-xs file:font-bold"
            />
          </div>
        </div>
        <p className="text-[11px] text-ink-faint">
          Leave a logo blank to keep the current one.
        </p>

        {error && <p className="text-sm text-bad">{error}</p>}
        {success && <p className="text-sm text-good">Branding updated.</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="cursor-pointer rounded-control bg-accent px-4 py-2.5 text-[13px] font-bold text-accent-ink disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save branding"}
          </button>
        </div>
      </form>
    </div>
  );
}

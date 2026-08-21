"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type { Branding } from "@/lib/branding";

// Edits an existing org's branding via the update-org-branding edge function
// (logo uploads need the service role -- see that function's header comment).
// Mirrors the color-picker fields from the old org-creation modal
// (admin-dashboard/page.tsx's EMPTY_ORG_DRAFT/ORG_COLOR_FIELDS), pre-filled
// from the org's current branding instead of the ACM defaults.

const COLOR_FIELDS = [
  { key: "primary", label: "Primary" },
  { key: "background", label: "Background" },
  { key: "backgroundSecondary", label: "Background (secondary)" },
  { key: "accent", label: "Accent" },
  { key: "text", label: "Text" },
] as const;

interface BrandingTabProps {
  orgId: string;
  branding: Branding;
  onSaved: (branding: Branding) => void;
}

export default function BrandingTab({ orgId, branding, onSaved }: BrandingTabProps) {
  const { getToken } = useAuth();

  const [colors, setColors] = useState(branding.colors);
  const [particleColor, setParticleColor] = useState(branding.particleColor);
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
      body.set("particle_color", particleColor);
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
    } catch (err) {
      console.error("update-org-branding request failed:", err);
      setError("Failed to update branding. See the browser console for details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl rounded-[14px] border border-slate-200 bg-white p-5 sm:p-7">
      <div className="mb-1 text-lg font-extrabold">Branding</div>
      <p className="mb-5 text-xs text-slate-500">
        Colors and logos shown across this organization&apos;s pages.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-500">
            Colors
          </label>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
            {COLOR_FIELDS.map((field) => (
              <div key={field.key} className="flex flex-col items-center gap-1">
                <input
                  type="color"
                  value={colors[field.key]}
                  onChange={(e) =>
                    setColors({ ...colors, [field.key]: e.target.value })
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

        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-500">
            Particle color
          </label>
          <input
            type="color"
            value={particleColor}
            onChange={(e) => setParticleColor(e.target.value)}
            className="h-9 w-20 cursor-pointer rounded-md border border-slate-200"
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-500">
              Crest logo
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => setCrestFile(e.target.files?.[0] ?? null)}
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
              onChange={(e) => setWordmarkFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-slate-500 file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-100 file:px-2.5 file:py-1.5 file:text-xs file:font-bold"
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-400">
          Leave a logo blank to keep the current one.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600">Branding updated.</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="cursor-pointer rounded-[9px] bg-brand-action px-4.5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save branding"}
          </button>
        </div>
      </form>
    </div>
  );
}

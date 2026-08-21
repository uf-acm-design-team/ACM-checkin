"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/app/utils/supabase/client";
import { FormBuilder } from "@/components/forms/form-builder";
import {
  canEditStructurally,
  normalizeSchema,
  parseAnswers,
  parseSchema,
  validateSchema,
  type FormSchema,
  type SchemaError,
} from "@/lib/form-schema";
import {
  attendanceFilename,
  buildAttendanceCsv,
  downloadCsv,
  type AttendanceRow,
} from "@/lib/attendance-csv";
import { ResponsesPanel } from "./responses-panel";

/**
 * Full-page meeting editor: Questions / Settings / Responses.
 *
 * Split out of the admin dashboard's modal because a form builder cannot live
 * in a 480px dialog -- that modal was already scrolling with six fields in it.
 * The dashboard's Meetings list links here for editing; it still creates
 * meetings in its own modal, since creation only needs the Settings fields.
 *
 * SAVING IS EXPLICIT. There is no autosave: a partially-edited schema is a
 * meaningful state (an option list mid-typing, a question with no label yet),
 * and persisting that on a debounce would publish it to the live check-in page
 * of an open meeting. The Save button commits; navigating away with unsaved
 * work warns first.
 */

type Meeting = {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  status: boolean;
  is_geo_locked: boolean;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  is_officer_only: boolean;
  form_schema: unknown;
};

type Settings = {
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  status: boolean;
  is_geo_locked: boolean;
  latitude: string;
  longitude: string;
  radius_meters: string;
  is_officer_only: boolean;
  // The actual current password (empty string = none). checkin_password is
  // column-locked from plain SELECT (see 20260826000000), so this is fetched
  // separately via the get_meeting_password() RPC in load() rather than
  // coming back with the rest of the row.
  checkin_password: string;
};

const EDITOR_TABS = [
  { key: "questions", label: "Questions" },
  { key: "settings", label: "Settings" },
  { key: "responses", label: "Responses" },
] as const;
type EditorTab = (typeof EDITOR_TABS)[number]["key"];

export default function MeetingEditor({
  params,
}: {
  params: Promise<{ orgSlug: string; meetingId: string }>;
}) {
  const { orgSlug, meetingId } = React.use(params);
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>("questions");

  // Draft state. `saved*` mirrors what is in the database so dirty state is a
  // comparison rather than a flag that has to be cleared everywhere.
  const [schema, setSchema] = useState<FormSchema>([]);
  const [savedSchema, setSavedSchema] = useState<string>("[]");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savedSettings, setSavedSettings] = useState<string>("");

  const [schemaErrors, setSchemaErrors] = useState<SchemaError[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [locating, setLocating] = useState(false);

  // Responses
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("meetings")
      .select(
        "id, org_id, title, description, start_time, end_time, status, is_geo_locked, latitude, longitude, radius_meters, is_officer_only, form_schema",
      )
      .eq("id", meetingId)
      .maybeSingle();

    if (fetchError || !data) {
      // RLS returns "no row" rather than a permission error for a meeting in an
      // org you don't belong to, so these two cases are indistinguishable here.
      setError("Meeting not found, or you don't have access to it.");
      setLoading(false);
      return;
    }

    const m = data as Meeting;
    const parsed = parseSchema(m.form_schema);

    // checkin_password is column-locked from the plain SELECT above (see
    // 20260826000000_meeting_levels_and_password.sql) -- fetched separately
    // through the officer-gated RPC. A failure here (e.g. a non-officer
    // somehow reaching this page) just leaves it blank rather than blocking
    // the rest of the editor.
    const { data: password } = await supabase.rpc("get_meeting_password", {
      p_meeting_id: meetingId,
    });

    const nextSettings: Settings = {
      title: m.title,
      description: m.description ?? "",
      // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm". start_time is a
      // timestamp WITHOUT time zone, so slice rather than round-tripping through
      // Date, which would shift by the viewer's UTC offset.
      start_time: m.start_time ? m.start_time.slice(0, 16) : "",
      end_time: m.end_time ? m.end_time.slice(0, 16) : "",
      status: m.status,
      is_geo_locked: m.is_geo_locked,
      latitude: m.latitude?.toString() ?? "",
      longitude: m.longitude?.toString() ?? "",
      radius_meters: (m.radius_meters ?? 200).toString(),
      is_officer_only: m.is_officer_only,
      checkin_password: password ?? "",
    };

    setMeeting(m);
    setSchema(parsed);
    setSavedSchema(JSON.stringify(parsed));
    setSettings(nextSettings);
    setSavedSettings(JSON.stringify(nextSettings));
    setLoading(false);
  }, [meetingId, supabase]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.push("/");
      return;
    }
    load();
  }, [isLoaded, user, router, load]);

  const fetchResponses = useCallback(async () => {
    setRowsLoading(true);
    try {
      const { data, error: rowsError } = await supabase
        .from("attendance")
        .select(
          "checked_in_at, answers, attendee:attendee_id(first_name, last_name, email, grad_year)",
        )
        .eq("meeting_id", meetingId)
        .order("checked_in_at", { ascending: true });

      if (rowsError) {
        setSaveError(rowsError.message);
        return;
      }

      type Row = {
        checked_in_at: string;
        answers: unknown;
        attendee: {
          first_name: string;
          last_name: string;
          email: string;
          grad_year: string;
        } | null;
      };

      setRows(
        ((data ?? []) as unknown as Row[]).map((row) => ({
          first_name: row.attendee?.first_name ?? "",
          last_name: row.attendee?.last_name ?? "",
          email: row.attendee?.email ?? "",
          grad_year: row.attendee?.grad_year ?? "",
          checked_in_at: row.checked_in_at,
          answers: parseAnswers(row.answers),
        })),
      );
    } finally {
      setRowsLoading(false);
    }
  }, [meetingId, supabase]);

  // Response count gates structural edits, so it is needed on the Questions tab
  // too -- fetch once the meeting resolves rather than on tab switch.
  useEffect(() => {
    if (meeting) fetchResponses();
  }, [meeting, fetchResponses]);

  const schemaDirty = JSON.stringify(schema) !== savedSchema;
  const settingsDirty = settings ? JSON.stringify(settings) !== savedSettings : false;
  const dirty = schemaDirty || settingsDirty;

  // Warn on tab close / hard navigation with unsaved work. Next's client router
  // doesn't fire this, which is why the Back button below checks `dirty` itself.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const responseCount = rows?.length ?? 0;
  const locked = !canEditStructurally(responseCount);

  const goBack = () => {
    if (dirty && !confirm("You have unsaved changes. Leave without saving?")) {
      return;
    }
    router.push(`/${orgSlug}/admin-dashboard`);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setSaveError("This browser doesn't support geolocation.");
      return;
    }
    setLocating(true);
    setSaveError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSettings((s) =>
          s
            ? {
                ...s,
                latitude: pos.coords.latitude.toFixed(6),
                longitude: pos.coords.longitude.toFixed(6),
              }
            : s,
        );
        setLocating(false);
      },
      (err) => {
        setSaveError(
          err.code === err.PERMISSION_DENIED
            ? "Location access denied. Allow it, or enter coordinates manually."
            : "Couldn't read your location. Check that GPS is on.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handleSave = async () => {
    if (!settings || !meeting) return;

    setSaveError(null);

    // Validate the form first so a schema problem surfaces on the tab that owns
    // it rather than silently failing behind the Settings tab.
    const errors = validateSchema(schema);
    setSchemaErrors(errors);
    if (errors.length > 0) {
      setActiveTab("questions");
      setSaveError("Fix the highlighted questions before saving.");
      return;
    }

    if (!settings.title.trim()) {
      setActiveTab("settings");
      setSaveError("A meeting needs a title.");
      return;
    }
    if (settings.end_time && settings.start_time > settings.end_time) {
      setActiveTab("settings");
      setSaveError("End time must be after the start time.");
      return;
    }

    const lat = settings.latitude.trim();
    const lng = settings.longitude.trim();
    if (settings.is_geo_locked && (!lat || !lng)) {
      setActiveTab("settings");
      setSaveError(
        "Geo-locked meetings need a location. Use “Use current location” or enter coordinates.",
      );
      return;
    }
    const radius = Number(settings.radius_meters);
    if (settings.is_geo_locked && (!Number.isFinite(radius) || radius <= 0)) {
      setActiveTab("settings");
      setSaveError("Radius must be a positive number of meters.");
      return;
    }

    const cleanSchema = normalizeSchema(schema);

    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("meetings")
        .update({
          title: settings.title.trim(),
          description: settings.description.trim() || null,
          start_time: settings.start_time,
          end_time: settings.end_time,
          status: settings.status,
          is_geo_locked: settings.is_geo_locked,
          // Only persist coordinates while geolocking is on, so un-geolocking
          // doesn't leave stale coordinates behind.
          latitude: settings.is_geo_locked ? Number(lat) : null,
          longitude: settings.is_geo_locked ? Number(lng) : null,
          radius_meters: settings.is_geo_locked ? radius : null,
          is_officer_only: settings.is_officer_only,
          checkin_password: settings.checkin_password.trim() || null,
          form_schema: cleanSchema,
        })
        .eq("id", meeting.id);

      if (updateError) {
        setSaveError(updateError.message);
        return;
      }

      // Adopt the normalized schema as the draft: saving trims labels and drops
      // empty options, and without this the form would still read as dirty
      // immediately after a successful save.
      setSchema(cleanSchema);
      setSavedSchema(JSON.stringify(cleanSchema));
      setSavedSettings(JSON.stringify(settings));
      setSchemaErrors([]);
      setSavedAt(new Date());
    } catch {
      setSaveError("Failed to save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    if (!rows || !meeting) return;
    downloadCsv(
      buildAttendanceCsv(rows, normalizeSchema(schema)),
      attendanceFilename(meeting.title),
    );
  };

  const savedLabel = useMemo(
    () =>
      savedAt
        ? `Saved at ${savedAt.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}`
        : null,
    [savedAt],
  );

  if (!isLoaded || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <div className="text-xl text-slate-500">Loading...</div>
      </div>
    );
  }

  if (error || !meeting || !settings) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-[14px] border border-slate-200 bg-white p-8 text-center">
          <h1 className="mb-2 text-2xl font-extrabold text-slate-900">Meeting</h1>
          <p className="mb-5 text-slate-500">{error}</p>
          <button
            onClick={() => router.push(`/${orgSlug}/admin-dashboard`)}
            className="cursor-pointer rounded-[9px] border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold text-brand-background hover:bg-slate-50"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              aria-label="Back to dashboard"
              className="-ml-2 flex-none cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-extrabold sm:text-lg">
                {settings.title.trim() || "Untitled meeting"}
              </div>
              <div className="text-xs font-semibold text-slate-500">
                {responseCount} response{responseCount === 1 ? "" : "s"}
                {dirty && (
                  <span className="ml-2 text-amber-600">· Unsaved changes</span>
                )}
                {!dirty && savedLabel && (
                  <span className="ml-2 text-green-600">· {savedLabel}</span>
                )}
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex-none cursor-pointer rounded-[9px] bg-brand-action px-4 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : dirty ? "Save" : "Saved"}
            </button>
          </div>

          <nav className="flex gap-1.5 rounded-[10px] bg-slate-100 p-1">
            {EDITOR_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-[13px] font-bold transition-all ${
                  activeTab === tab.key
                    ? "bg-white text-brand-background shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.label}
                {tab.key === "questions" && schema.length > 0 && (
                  <span className="ml-1.5 text-slate-400">{schema.length}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        {saveError && (
          <div className="mb-4 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {saveError}
          </div>
        )}

        {activeTab === "questions" && (
          <FormBuilder
            schema={schema}
            locked={locked}
            errors={schemaErrors}
            onChange={setSchema}
          />
        )}

        {activeTab === "settings" && (
          <div className="flex flex-col gap-4 rounded-[14px] border border-slate-200 bg-white p-5 sm:p-6">
            <Field label="Title">
              <input
                type="text"
                value={settings.title}
                onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              />
            </Field>

            <Field label="Description" optional>
              <textarea
                rows={2}
                value={settings.description}
                onChange={(e) =>
                  setSettings({ ...settings, description: e.target.value })
                }
                placeholder="What's this meeting about?"
                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start time">
                <input
                  type="datetime-local"
                  value={settings.start_time}
                  onChange={(e) =>
                    setSettings({ ...settings, start_time: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                />
              </Field>
              <Field label="End time">
                <input
                  type="datetime-local"
                  value={settings.end_time}
                  onChange={(e) =>
                    setSettings({ ...settings, end_time: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                />
              </Field>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3">
              <input
                type="checkbox"
                checked={settings.status}
                onChange={(e) =>
                  setSettings({ ...settings, status: e.target.checked })
                }
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="font-bold">Open for check-in</span>
                <span className="block text-xs text-slate-500">
                  Members and guests can check in while this is on.
                </span>
              </span>
            </label>

            <div className="rounded-lg border border-slate-200 p-3">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.is_geo_locked}
                  onChange={(e) =>
                    setSettings({ ...settings, is_geo_locked: e.target.checked })
                  }
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-bold">Require being on location</span>
                  <span className="block text-xs text-slate-500">
                    Check-in is refused beyond the radius below.
                  </span>
                </span>
              </label>

              {settings.is_geo_locked && (
                <div className="mt-3 flex flex-col gap-2.5 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={useCurrentLocation}
                    disabled={locating}
                    className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {locating ? "Getting location..." : "📍 Use current location"}
                  </button>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label="Latitude" small>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={settings.latitude}
                        onChange={(e) =>
                          setSettings({ ...settings, latitude: e.target.value })
                        }
                        placeholder="29.648"
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                      />
                    </Field>
                    <Field label="Longitude" small>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={settings.longitude}
                        onChange={(e) =>
                          setSettings({ ...settings, longitude: e.target.value })
                        }
                        placeholder="-82.344"
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                      />
                    </Field>
                  </div>
                  <Field label="Radius (meters)" small>
                    <input
                      type="number"
                      min={10}
                      step={10}
                      value={settings.radius_meters}
                      onChange={(e) =>
                        setSettings({ ...settings, radius_meters: e.target.value })
                      }
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                    />
                  </Field>
                  <p className="text-[11px] text-slate-500">
                    200m suits a lecture hall. Phone GPS is only accurate to
                    roughly 10–50m indoors, so avoid going much tighter.
                  </p>
                </div>
              )}
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3">
              <input
                type="checkbox"
                checked={settings.is_officer_only}
                onChange={(e) =>
                  setSettings({ ...settings, is_officer_only: e.target.checked })
                }
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="font-bold">Officers only</span>
                <span className="block text-xs text-slate-500">
                  Hidden from regular members entirely -- doesn&apos;t appear on
                  their check-in page or count toward their attendance.
                </span>
              </span>
            </label>

            <Field label="Password" optional>
              <input
                type="text"
                value={settings.checkin_password}
                onChange={(e) =>
                  setSettings({ ...settings, checkin_password: e.target.value })
                }
                placeholder="Leave blank for no password"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Required from everyone checking in, guest or member.
              </p>
            </Field>
          </div>
        )}

        {activeTab === "responses" && (
          <ResponsesPanel
            schema={normalizeSchema(schema)}
            rows={rows}
            loading={rowsLoading}
            schemaDirty={schemaDirty}
            onExport={exportCsv}
          />
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  optional,
  small,
  children,
}: {
  label: string;
  optional?: boolean;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className={`mb-1.5 block font-bold text-slate-500 ${
          small ? "text-[11px]" : "text-xs"
        }`}
      >
        {label}
        {optional && <span className="font-medium"> (optional)</span>}
      </label>
      {children}
    </div>
  );
}

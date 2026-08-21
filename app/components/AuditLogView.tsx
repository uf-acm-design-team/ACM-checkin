"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/app/utils/supabase/client";

// Shared table for both the per-org Audit Log tab (admin-dashboard, scope
// 'org') and the platform-wide Developer Audit Log (/developer, scope
// 'platform') -- same shape, same RLS-backed query, only the filter differs.
// See supabase/migrations/20260823000000_audit_log_schema.sql and
// 20260824000000_member_management_and_coowner.sql for the actions this
// renders.

interface AuditLogRow {
  id: number;
  created_at: string;
  actor_name: string;
  action: string;
  metadata: Record<string, unknown>;
}

const ACTION_LABELS: Record<string, string> = {
  "member.role_changed": "Role changed",
  "member.removed": "Member removed",
  "member.invited": "Member invited",
  "meeting.deleted": "Meeting deleted",
  "meeting.status_toggled": "Check-in toggled",
  "meeting.geo_lock_changed": "Geo-lock changed",
  "attendance.exported": "Attendance exported",
  "attendance.manual_entry": "Attendance added manually",
  "org.ownership_transferred": "Ownership transferred",
  "org.created": "Organization created",
  "org.deleted": "Organization deleted",
  "org.branding_updated": "Branding updated",
  "admin.granted": "Admin access granted",
  "admin.revoked": "Admin access revoked",
};

function summarize(action: string, metadata: Record<string, unknown>): string {
  const str = (key: string) => (typeof metadata[key] === "string" ? (metadata[key] as string) : "");

  switch (action) {
    case "member.role_changed":
      return `${str("target_name")}: ${str("from_role")} → ${str("to_role")}`;
    case "member.removed":
      return `${str("target_name")} (was ${str("prior_role")})`;
    case "member.invited":
      return `${str("target_email")} as ${str("role")}`;
    case "meeting.deleted":
      return str("meeting_title");
    case "meeting.status_toggled":
      return `${str("meeting_title")}: ${metadata.to_status ? "opened" : "closed"}`;
    case "meeting.geo_lock_changed":
      return str("meeting_title");
    case "attendance.exported":
      return `${str("meeting_title")} (${String(metadata.row_count ?? "?")} rows)`;
    case "attendance.manual_entry":
      return `${str("target_name")} → ${str("meeting_title")}`;
    case "org.ownership_transferred":
      return `${str("from_name")} → ${str("to_name")}`;
    case "org.created":
    case "org.deleted":
    case "org.branding_updated":
      return `${str("name")}${str("slug") ? ` (@${str("slug")})` : ""}`;
    case "admin.granted":
    case "admin.revoked":
      return str("target_name");
    default:
      return "";
  }
}

interface AuditLogViewProps {
  scope: "org" | "platform";
  orgId?: string;
  emptyMessage?: string;
}

export default function AuditLogView({ scope, orgId, emptyMessage }: AuditLogViewProps) {
  const supabase = createClient();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (scope === "org" && !orgId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("audit_log")
        .select("id, created_at, actor_name, action, metadata")
        .eq("scope", scope)
        .order("created_at", { ascending: false })
        .limit(200);

      if (scope === "org" && orgId) {
        query = query.eq("org_id", orgId);
      }

      const { data, error: fetchError } = await query;
      if (cancelled) return;

      if (fetchError) {
        console.error("Error fetching audit log:", fetchError);
        setError("Could not load the audit log.");
      } else {
        setRows(data || []);
      }
      setLoading(false);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [scope, orgId, supabase]);

  if (loading) {
    return (
      <div className="p-10 text-center text-sm text-slate-500">
        Loading audit log...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[14px] border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
      <div className="hidden grid-cols-[1.4fr_1.4fr_1.6fr_2.4fr] gap-4 border-b border-slate-200 px-5 py-3.5 text-xs font-bold tracking-wide text-slate-500 uppercase md:grid">
        <div>When</div>
        <div>Who</div>
        <div>Action</div>
        <div>Details</div>
      </div>
      {rows.length > 0 ? (
        rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-1.5 border-b border-slate-100 px-4 py-3.5 text-sm last:border-b-0 sm:px-5 md:grid md:grid-cols-[1.4fr_1.4fr_1.6fr_2.4fr] md:items-center md:gap-4"
          >
            <div className="text-[13px] font-medium text-slate-600">
              {new Date(row.created_at).toLocaleString()}
            </div>
            <div className="font-bold">{row.actor_name}</div>
            <div>
              <span className="inline-block rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                {ACTION_LABELS[row.action] ?? row.action}
              </span>
            </div>
            <div className="text-[13px] font-medium wrap-break-word text-slate-600">
              {summarize(row.action, row.metadata ?? {})}
            </div>
          </div>
        ))
      ) : (
        <div className="p-10 text-center text-sm text-slate-500">
          {emptyMessage ?? "No activity recorded yet."}
        </div>
      )}
    </div>
  );
}

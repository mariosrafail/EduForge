import React, { useState } from "react";
import { ClipboardList, RotateCcw, Search } from "lucide-react";
import {
  PlatformButton, PlatformCard, PlatformEmptyState, PlatformLoadingState,
} from "../components/PlatformUi.jsx";

const emptyFilters = { platformAdminId: "", auditAction: "", targetType: "", schoolId: "", from: "", to: "" };
const blockedMetadataKeys = /password|token|secret|answer|solution|database_url/i;

function safeMetadata(value, depth = 0) {
  if (depth > 3) return "[nested data]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeMetadata(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !blockedMetadataKeys.test(key))
      .slice(0, 30)
      .map(([key, item]) => [key, safeMetadata(item, depth + 1)]));
  }
  return typeof value === "string" && value.length > 240 ? `${value.slice(0, 240)}…` : value;
}

const readableAction = (action = "") => action.split("_").map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" ");

export function AuditLogSection({ data, load, loading }) {
  const auditData = data.audit || {};
  const schools = data.schoolsForFilters || [];
  const rows = auditData.audit || [];
  const [filters, setFilters] = useState(emptyFilters);
  const reset = () => {
    setFilters(emptyFilters);
    load("audit", emptyFilters);
  };
  return (
    <div className="pa-section-stack">
      <PlatformCard title="Filter privileged activity" description="Audit history is read-only and excludes secrets and answer data.">
        <form className="pa-filter-grid pa-audit-filters" onSubmit={(event) => { event.preventDefault(); load("audit", filters); }}>
          <label>Platform Admin<select aria-label="Filter Platform Admin" value={filters.platformAdminId} onChange={(event) => setFilters({ ...filters, platformAdminId: event.target.value })}><option value="">All Platform Admins</option>{auditData.platformAdmins?.map((admin) => <option key={admin.id} value={admin.id}>{admin.full_name}</option>)}</select></label>
          <label>Action<input aria-label="Filter audit action" placeholder="e.g. school_created" value={filters.auditAction} onChange={(event) => setFilters({ ...filters, auditAction: event.target.value })} /></label>
          <label>Target<select aria-label="Filter target type" value={filters.targetType} onChange={(event) => setFilters({ ...filters, targetType: event.target.value })}><option value="">All targets</option><option value="school">School</option><option value="ordinary_user">Ordinary user</option><option value="platform_admin">Platform Admin</option><option value="session">Session</option></select></label>
          <label>School<select aria-label="Filter audit school" value={filters.schoolId} onChange={(event) => setFilters({ ...filters, schoolId: event.target.value })}><option value="">All schools</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>
          <label>From<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
          <label>To<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
          <div className="pa-filter-actions"><PlatformButton type="submit" size="compact" icon={Search} loading={loading.audit}>Apply filters</PlatformButton><PlatformButton variant="ghost" size="compact" icon={RotateCcw} onClick={reset}>Reset</PlatformButton></div>
        </form>
      </PlatformCard>
      <PlatformCard title="Privileged events" description={`${rows.length} audit event${rows.length === 1 ? "" : "s"}`}>
        {loading.audit && !data.audit ? <PlatformLoadingState label="Loading audit history…" /> : rows.length === 0 ? (
          <PlatformEmptyState icon={ClipboardList} title="No audit events found">Reset the filters or choose a wider date range.</PlatformEmptyState>
        ) : (
          <div className="pa-table-wrap"><table><thead><tr><th>Time</th><th>Platform Admin</th><th>Action</th><th>Target</th><th>School</th><th>Metadata</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.platform_admin_name || "Removed account"}</td><td><span className="pa-audit-action" title={row.action}>{readableAction(row.action)}</span><small>{row.action}</small></td><td>{row.target_type}{row.target_id ? ` · ${row.target_id}` : ""}</td><td>{row.school_name || "—"}</td><td><code>{JSON.stringify(safeMetadata(row.metadata))}</code></td></tr>)}</tbody></table></div>
        )}
      </PlatformCard>
    </div>
  );
}

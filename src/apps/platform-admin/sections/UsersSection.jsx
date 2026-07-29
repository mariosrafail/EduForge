import React, { useState } from "react";
import { ArrowLeft, Eye, PauseCircle, PlayCircle, RotateCcw, Search, ShieldOff, UsersRound } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { platformApi } from "../platformAdminApi.js";
import {
  PlatformAlert, PlatformButton, PlatformCard, PlatformEmptyState,
  PlatformLoadingState, PlatformStatusBadge,
} from "../components/PlatformUi.jsx";

const emptyFilters = { schoolId: "", role: "", status: "", search: "" };
const roleLabel = (role) => role === "admin" ? "School Admin" : `${role?.charAt(0).toUpperCase()}${role?.slice(1)}`;

function UserDetail({ user, onClose }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div className="pa-detail-stack" initial={reduceMotion ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
      <PlatformButton variant="link" icon={ArrowLeft} onClick={onClose}>All users</PlatformButton>
      <PlatformCard className="pa-detail-summary">
        <div><span className="pa-eyebrow">User identity</span><h2>{user.full_name}</h2><p>{user.email}</p></div>
        <PlatformStatusBadge value={user.status} />
      </PlatformCard>
      <PlatformCard title="Account details" description="Read-only ordinary-account information.">
        <dl className="pa-detail-list">
          <dt>School</dt><dd>{user.school_name}</dd>
          <dt>Role</dt><dd>{roleLabel(user.role)}</dd>
          <dt>Status</dt><dd><PlatformStatusBadge value={user.status} /></dd>
          <dt>Level</dt><dd>{user.level || "—"}</dd>
          <dt>Created</dt><dd>{new Date(user.created_at).toLocaleString()}</dd>
        </dl>
      </PlatformCard>
    </motion.div>
  );
}

export function UsersSection({ data, load, loading, setError }) {
  const users = data.users?.users || [];
  const schools = data.schoolsForFilters || [];
  const [filters, setFilters] = useState(emptyFilters);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");

  const apply = () => load("users", filters);
  const reset = () => {
    setFilters(emptyFilters);
    load("users", emptyFilters);
  };
  async function operation(key, callback, message) {
    if (busy) return;
    setBusy(key); setError(""); setFeedback("");
    try {
      await callback();
      setFeedback(message);
      await load("users", filters);
    } catch (error) { setError(error.message); } finally { setBusy(""); }
  }
  async function open(user) {
    if (busy) return;
    setBusy(`view-${user.id}`); setError("");
    try {
      const payload = await platformApi.get("user", { id: user.id });
      setSelected(payload.user);
    } catch (error) { setError(error.message); } finally { setBusy(""); }
  }

  if (selected) return <UserDetail user={selected} onClose={() => setSelected(null)} />;
  return (
    <div className="pa-section-stack">
      <PlatformCard title="Find users" description="Search ordinary accounts and narrow results by tenant, role, or status.">
        <form className="pa-filter-grid" onSubmit={(event) => { event.preventDefault(); apply(); }}>
          <label>Search<input aria-label="Search users" placeholder="Name or email" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
          <label>School<select aria-label="Filter school" value={filters.schoolId} onChange={(event) => setFilters({ ...filters, schoolId: event.target.value })}><option value="">All schools</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>
          <label>Role<select aria-label="Filter role" value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}><option value="">All roles</option><option value="admin">School Admin</option><option value="teacher">Teacher</option><option value="student">Student</option></select></label>
          <label>Status<select aria-label="Filter status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option><option value="active">Active</option><option value="invited">Invited</option><option value="paused">Paused</option></select></label>
          <div className="pa-filter-actions"><PlatformButton type="submit" size="compact" icon={Search} loading={loading.users}>Apply filters</PlatformButton><PlatformButton variant="ghost" size="compact" icon={RotateCcw} onClick={reset}>Reset</PlatformButton></div>
        </form>
      </PlatformCard>
      {feedback && <PlatformAlert onDismiss={() => setFeedback("")}>{feedback}</PlatformAlert>}
      <PlatformCard title="User directory" description={`${users.length} matching account${users.length === 1 ? "" : "s"}`}>
        {loading.users && !data.users ? <PlatformLoadingState label="Loading users…" /> : users.length === 0 ? (
          <PlatformEmptyState icon={UsersRound} title="No users found">Reset the filters or try another search.</PlatformEmptyState>
        ) : (
          <div className="pa-table-wrap"><table><thead><tr><th>User</th><th>School</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>
            {users.map((user) => <tr key={user.id}><td><PlatformButton variant="link" onClick={() => open(user)}>{user.full_name}</PlatformButton><small>{user.email}</small></td><td>{user.school_name}</td><td><span className="pa-role-label">{roleLabel(user.role)}</span></td><td><PlatformStatusBadge value={user.status} /></td><td><div className="pa-actions"><PlatformButton variant="ghost" size="compact" icon={Eye} loading={busy === `view-${user.id}`} disabled={Boolean(busy)} onClick={() => open(user)}>View</PlatformButton><PlatformButton variant={user.status === "paused" ? "secondary" : "warning"} size="compact" icon={user.status === "paused" ? PlayCircle : PauseCircle} loading={busy === `status-${user.id}`} disabled={Boolean(busy)} onClick={() => operation(`status-${user.id}`, () => platformApi.mutate("user-status", { id: user.id, status: user.status === "paused" ? "active" : "paused" }), `${user.full_name} ${user.status === "paused" ? "reactivated" : "paused"}.`)}>{user.status === "paused" ? "Reactivate" : "Pause"}</PlatformButton><PlatformButton variant="danger" size="compact" icon={ShieldOff} loading={busy === `revoke-${user.id}`} disabled={Boolean(busy)} onClick={() => operation(`revoke-${user.id}`, () => platformApi.mutate("revoke-user-sessions", { id: user.id }), `Sessions revoked for ${user.full_name}.`)}>Revoke sessions</PlatformButton></div></td></tr>)}
          </tbody></table></div>
        )}
      </PlatformCard>
    </div>
  );
}

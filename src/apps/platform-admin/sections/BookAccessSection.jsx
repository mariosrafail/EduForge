import React, { useEffect, useState } from "react";
import { BookOpenCheck, KeyRound, ShieldMinus } from "lucide-react";
import { platformApi } from "../platformAdminApi.js";
import {
  PlatformAlert, PlatformButton, PlatformCard, PlatformEmptyState, PlatformLoadingState,
} from "../components/PlatformUi.jsx";

export function BookAccessSection({ data, load, loading, setError }) {
  const accessData = data.access || {};
  const users = data.accessUsers || [];
  const packages = accessData.packages || [];
  const rows = accessData.access || [];
  const [userId, setUserId] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!slug && packages[0]?.slug) setSlug(packages[0].slug);
  }, [packages, slug]);

  async function mutate(mode) {
    if (!userId || !slug || busy) return;
    setBusy(mode); setError(""); setFeedback("");
    try {
      await platformApi.mutate("package-access", { mode, user_id: userId, package_slug: slug });
      setFeedback(mode === "grant" ? "Book access granted." : "Book access revoked.");
      await load("access");
    } catch (error) { setError(error.message); } finally { setBusy(""); }
  }

  return (
    <div className="pa-section-stack">
      <PlatformCard title="Manage entitlement" description="Grant or revoke only packages currently active in Phase 1.">
        <div className="pa-access-controls">
          <label>User<select aria-label="Access user" value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Select user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.full_name} — {user.school_name}</option>)}</select></label>
          <label>Package<select aria-label="Package" value={slug} onChange={(event) => setSlug(event.target.value)}>{packages.length === 0 && <option value="">No active packages</option>}{packages.map((item) => <option key={item.id} value={item.slug}>{item.title}</option>)}</select></label>
          <div className="pa-filter-actions"><PlatformButton icon={KeyRound} loading={busy === "grant"} disabled={!userId || !slug || Boolean(busy)} onClick={() => mutate("grant")}>Grant access</PlatformButton><PlatformButton variant="danger" icon={ShieldMinus} loading={busy === "revoke"} disabled={!userId || !slug || Boolean(busy)} onClick={() => mutate("revoke")}>Revoke access</PlatformButton></div>
        </div>
      </PlatformCard>
      {feedback && <PlatformAlert onDismiss={() => setFeedback("")}>{feedback}</PlatformAlert>}
      <PlatformCard title="Current entitlements" description={`${rows.length} active package grant${rows.length === 1 ? "" : "s"}`}>
        {loading.access && !data.access ? <PlatformLoadingState label="Loading book access…" /> : rows.length === 0 ? (
          <PlatformEmptyState icon={BookOpenCheck} title="No entitlements found">Choose a user and active Phase 1 package to grant access.</PlatformEmptyState>
        ) : (
          <div className="pa-table-wrap"><table><thead><tr><th>User</th><th>School</th><th>Role</th><th>Package</th><th>Granted</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.full_name}</strong><small>{row.email}</small></td><td>{row.school_name}</td><td><span className="pa-role-label">{row.role_scope}</span></td><td>{row.package_title}</td><td>{new Date(row.granted_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>
        )}
      </PlatformCard>
    </div>
  );
}

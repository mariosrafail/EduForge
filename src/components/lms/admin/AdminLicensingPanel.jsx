import { Download, KeyRound, Plus, RefreshCw, ShieldX } from "lucide-react";
import { useEffect, useState } from "react";
import { downloadLicensingCsv, generateLicensingBatch, getLicensingBatch, getLicensingOverview, resetRedeemedLicense, revokeUnusedLicenses } from "../../../services/licensingApi.js";
import { Card, Tag } from "../Shared.jsx";

function formatDate(value) {
  if (!value) return "No expiry";
  return new Date(value).toLocaleString();
}

export function AdminLicensingPanel() {
  const [overview, setOverview] = useState({ packages: [], batches: [], metrics: {} });
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [oneTimeExport, setOneTimeExport] = useState(null);
  const [form, setForm] = useState({ bookPackageId: "", quantity: 10, label: "", expiresAt: "" });
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const data = await getLicensingOverview();
    setOverview(data);
    setForm((current) => ({ ...current, bookPackageId: current.bookPackageId || data.packages?.[0]?.id || "" }));
    return data;
  };

  useEffect(() => {
    refresh().catch((requestError) => setError(requestError.message));
  }, []);

  const generate = async (event) => {
    event.preventDefault();
    setBusy(true); setError(""); setStatus(""); setOneTimeExport(null);
    try {
      const result = await generateLicensingBatch({
        ...form,
        quantity: Number(form.quantity),
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        requestKey,
      });
      setOneTimeExport(result);
      setRequestKey(crypto.randomUUID());
      setStatus(`${result.batch.quantity} one-time licenses generated. Download the CSV now; full codes cannot be retrieved later.`);
      await refresh();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const viewBatch = async (batchId) => {
    setBusy(true); setError("");
    try { setSelectedBatch(await getLicensingBatch(batchId)); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const revoke = async (batchId) => {
    if (!window.confirm("Revoke every unused code in this batch? Redeemed access is not affected.")) return;
    setBusy(true); setError("");
    try {
      const result = await revokeUnusedLicenses(batchId);
      setStatus(`${result.revokedCount} unused licenses revoked.`);
      await refresh();
      if (selectedBatch?.batch?.id === batchId) await viewBatch(batchId);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const resetCode = async (codeId) => {
    if (!window.confirm("Reset this redeemed license and remove its linked book entitlement?")) return;
    setBusy(true); setError("");
    try {
      await resetRedeemedLicense(codeId);
      setStatus("License reset and linked entitlement removed.");
      await refresh();
      await viewBatch(selectedBatch.batch.id);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Card>
        <div className="card-heading">
          <div><span className="eyebrow"><KeyRound size={15} /> Book licensing</span><h2>Generate one-time school access codes</h2><p>Codes are tied to this school and shown in full only in the initial CSV export.</p></div>
          <Tag tone="green">Database-backed</Tag>
        </div>
        {error && <div className="inline-status warning">{error}</div>}
        {status && <div className="inline-status success">{status}</div>}
        <form className="auth-form" onSubmit={generate}>
          <label>Book package<select value={form.bookPackageId} onChange={(event) => { setForm({ ...form, bookPackageId: event.target.value }); setRequestKey(crypto.randomUUID()); }} required>{overview.packages.map((item) => <option key={item.id} value={item.id}>{item.title} ({item.level})</option>)}</select></label>
          <label>Batch label<input value={form.label} maxLength={120} onChange={(event) => { setForm({ ...form, label: event.target.value }); setRequestKey(crypto.randomUUID()); }} placeholder="September B2 intake" /></label>
          <label>Quantity<input type="number" min="1" max="500" value={form.quantity} onChange={(event) => { setForm({ ...form, quantity: event.target.value }); setRequestKey(crypto.randomUUID()); }} required /></label>
          <label>Expiry (optional)<input type="datetime-local" value={form.expiresAt} onChange={(event) => { setForm({ ...form, expiresAt: event.target.value }); setRequestKey(crypto.randomUUID()); }} /></label>
          <button className="primary-action" disabled={busy || !overview.packages.length} type="submit"><Plus size={17} /> {busy ? "Working..." : "Generate batch"}</button>
        </form>
        {oneTimeExport?.csv && <div className="inline-status warning"><strong>One-time export ready.</strong> Store it securely. <button type="button" className="secondary-action compact-action" onClick={() => downloadLicensingCsv(oneTimeExport.csv, `book-codes-${oneTimeExport.batch.id}.csv`)}><Download size={16} /> Download CSV</button></div>}
        <section className="student-grade-summary">
          <article className="panel"><strong>{overview.metrics.entitlements || 0}</strong><span>Active entitlements</span></article>
          <article className="panel"><strong>{overview.batches.reduce((sum, item) => sum + item.unusedCount, 0)}</strong><span>Unused codes</span></article>
          <article className="panel"><strong>{overview.batches.reduce((sum, item) => sum + item.redeemedCount, 0)}</strong><span>Redeemed codes</span></article>
        </section>
      </Card>
      <Card>
        <div className="card-heading"><div><span className="eyebrow">License batches</span><h2>School batch history</h2></div><button type="button" className="secondary-action compact-action" disabled={busy} onClick={() => refresh().catch((requestError) => setError(requestError.message))}><RefreshCw size={16} /> Refresh</button></div>
        {!overview.batches.length && <p>No license batches have been generated for this school.</p>}
        <div className="class-list">
          {overview.batches.map((batch) => <article key={batch.id}><div><strong>{batch.label || batch.bookPackageTitle}</strong><span>{batch.bookPackageTitle} / {batch.quantity} total / {batch.unusedCount} unused / {batch.redeemedCount} redeemed / {batch.expiredCount} expired / {batch.revokedCount} revoked</span><small>Created {formatDate(batch.createdAt)} / Expires {formatDate(batch.expiresAt)}</small></div><div className="table-actions"><button type="button" className="secondary-action compact-action" disabled={busy} onClick={() => viewBatch(batch.id)}>View masked codes</button><button type="button" className="danger-action compact-action" disabled={busy || !batch.unusedCount} onClick={() => revoke(batch.id)}><ShieldX size={15} /> Revoke unused</button></div></article>)}
        </div>
      </Card>
      {selectedBatch && <Card><div className="card-heading"><div><span className="eyebrow">Masked code audit</span><h2>{selectedBatch.batch.label || selectedBatch.batch.bookPackageTitle}</h2></div></div><div className="user-table"><div className="user-table-head"><span>Code</span><span>Status</span><span>Redeemed by</span><span>Action</span></div>{selectedBatch.codes.map((code) => <div className="user-table-row" key={code.id}><span>{code.maskedCode}</span><span>{code.status}</span><span>{code.redeemedBy ? `${code.redeemedBy.name} (${code.redeemedBy.email})` : "-"}</span><span>{code.status === "redeemed" && <button type="button" className="danger-action compact-action" disabled={busy} onClick={() => resetCode(code.id)}>Reset</button>}</span></div>)}</div></Card>}
    </>
  );
}

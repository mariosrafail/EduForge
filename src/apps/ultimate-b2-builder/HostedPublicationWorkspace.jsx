import { useCallback, useEffect, useMemo, useState } from "react";
import { HostedViewerPreview } from "../book-builder/hosted/HostedViewerPreview.jsx";

const endpoint = "/builder/api/publication/books/ultimate-b2/components/ultimate-b2-students-book";

async function request(path = "", options = {}) {
  const response = await fetch(`${endpoint}${path}`, { credentials: "same-origin", cache: "no-store", ...options, headers: options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(payload.error || "Publication request failed."); error.code = payload.error; throw error; }
  return payload;
}

const short = (value) => value ? String(value).slice(0, 12) : "—";
const date = (value) => value ? new Date(value).toLocaleString() : "—";

export function HostedPublicationWorkspace() {
  const [status, setStatus] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    const next = await request();
    setStatus(next);
    setSelectedId((current) => current && next.releases.some((release) => release.id === current) ? current : next.releases[0]?.id || "");
  }, []);
  useEffect(() => { refresh().catch((error) => setMessage(error.message)); }, [refresh]);
  const selected = useMemo(() => status?.releases.find((release) => release.id === selectedId) || null, [selectedId, status]);
  const prepare = async () => {
    setBusy("prepare"); setMessage("");
    try {
      const result = await request("/prepare", { method: "POST", body: JSON.stringify({ clientMutationId: crypto.randomUUID(), releaseNote: "" }) });
      setMessage(`Preview release ${result.releaseNumber} prepared from saved Builder state.`);
      await refresh(); setSelectedId(result.releaseId);
    } catch (error) { setMessage(error.code === "release_asset_unavailable" ? "A referenced immutable asset could not be verified. No release was created." : error.message); }
    finally { setBusy(""); }
  };
  const publish = async () => {
    if (!selected || selected.state !== "current") return;
    if (!globalThis.confirm(`Publish Ultimate B2 / Students Book release ${selected.number}? Only the saved content in this exact preview will become active.`)) return;
    setBusy("publish"); setMessage("");
    try {
      await request("/publish", { method: "POST", body: JSON.stringify({ releaseId: selected.id, expectedHeadRevision: status.headRevision, clientMutationId: crypto.randomUUID() }) });
      setMessage(`Release ${selected.number} is now published.`); await refresh();
    } catch (error) { setMessage(error.code === "stale_release_preview" ? "This preview is stale. Prepare and review a new preview before publishing." : error.message); await refresh().catch(() => {}); }
    finally { setBusy(""); }
  };
  if (!status) return <main className="publication-workspace"><p role="status">{message || "Loading publication state…"}</p></main>;
  return <main className="publication-workspace">
    <header><span>Ultimate B2 · Students Book</span><h1>Publication</h1><p>Only successfully saved Builder revisions are included. Preview releases are immutable.</p></header>
    <div className="publication-summary">
      <section><h2>Current draft</h2><strong>{status.published?.sourceSnapshotSha256 === status.currentSourceSha256 ? "Matches published release" : "Contains unpublished changes"}</strong><code>{short(status.currentSourceSha256)}</code></section>
      <section><h2>Current published</h2>{status.published ? <><strong>Release {status.published.number}</strong><span>{date(status.published.publishedAt)}</span><code>{short(status.published.releaseSha256)}</code></> : <strong>No release published yet</strong>}</section>
      <section><h2>Preview release</h2>{selected ? <><strong>Release {selected.number} · {selected.state === "current" ? "Current" : "Stale"}</strong><span>{date(selected.createdAt)}</span><code>{short(selected.releaseSha256)}</code></> : <strong>No preview prepared</strong>}</section>
    </div>
    <div className="publication-actions"><button type="button" disabled={Boolean(busy)} onClick={prepare}>{busy === "prepare" ? "Preparing…" : "Prepare Preview"}</button><button type="button" disabled={!selected || selected.state !== "current" || Boolean(busy)} onClick={publish}>{busy === "publish" ? "Publishing…" : "Publish Preview"}</button>{message ? <p role="status">{message}</p> : null}</div>
    {selected ? <HostedViewerPreview intent={{ view: "library", releaseId: selected.id }} refreshKey={selected.id} title={`Immutable release ${selected.number} preview`} description="Pinned to this release ID; later draft saves do not alter it." /> : null}
    <section className="publication-history"><h2>Recent releases</h2><table><thead><tr><th>Release</th><th>Fingerprint</th><th>Created</th><th>Status</th></tr></thead><tbody>{status.releases.map((release) => <tr key={release.id}><td><button type="button" onClick={() => setSelectedId(release.id)}>#{release.number}</button></td><td><code>{short(release.releaseSha256)}</code></td><td>{date(release.createdAt)}</td><td>{release.current ? "Published" : release.state === "current" ? "Preview current" : "Stale"}</td></tr>)}</tbody></table></section>
  </main>;
}

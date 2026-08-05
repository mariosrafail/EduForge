import { AlertTriangle, CheckCircle2, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { applyDecision, previewDecision, removeDecision, reapproveDecision } from "../bookBuilderApi.js";
import { Badge, Field } from "./StudioPrimitives.jsx";

function mutationId() { return `mutation_${crypto.randomUUID()}`; }

export function DecisionDrawer({ projectId, expectedRevision, target, kinds, onCommitted, onClose }) {
  const [kind, setKind] = useState(kinds[0].kind);
  const selected = useMemo(() => kinds.find((item) => item.kind === kind) || kinds[0], [kind, kinds]);
  const [value, setValue] = useState(selected.initialValue ?? selected.values?.[0] ?? "");
  const [approvalState, setApprovalState] = useState(selected.currentDecision?.approvalState || "draft");
  const [editorNote, setEditorNote] = useState(selected.currentDecision?.editorNote || "");
  const [preview, setPreview] = useState(null);
  const [state, setState] = useState({ status: "idle", error: null, message: "" });
  const [dirty, setDirty] = useState(false);
  const dialog = useRef(null);
  const returnFocus = useRef(document.activeElement);

  useEffect(() => {
    dialog.current?.querySelector("select, input, textarea, button")?.focus();
    return () => returnFocus.current?.focus?.();
  }, []);
  useEffect(() => {
    const warning = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    const navigation = (event) => {
      const link = event.target.closest?.('a[href^="#"]');
      if (dirty && link && !window.confirm("Discard the unsaved decision draft?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warning);
    document.addEventListener("click", navigation, true);
    return () => { window.removeEventListener("beforeunload", warning); document.removeEventListener("click", navigation, true); };
  }, [dirty]);

  const update = (setter) => (event) => { setter(event.target.value); setDirty(true); setPreview(null); setState({ status: "idle", error: null, message: "" }); };
  const chooseKind = (event) => {
    const next = kinds.find((item) => item.kind === event.target.value);
    setKind(next.kind);
    setValue(next.currentDecision?.value ?? next.initialValue ?? next.values?.[0] ?? "");
    setApprovalState(next.currentDecision?.approvalState || "draft");
    setEditorNote(next.currentDecision?.editorNote || "");
    setDirty(false);
    setPreview(null);
  };
  const body = () => ({ targetId: target.targetId, kind, value: kind === "printed_page_number" ? Number(value) : value, approvalState, editorNote, expectedRevision, clientMutationId: mutationId() });

  async function runPreview() {
    setState({ status: "working", error: null, message: "" });
    try { setPreview(await previewDecision(projectId, body())); setState({ status: "idle", error: null, message: "Preview ready for confirmation." }); }
    catch (error) { setState({ status: error.code === "project_revision_conflict" ? "conflict" : "error", error, message: "" }); }
  }

  async function commit() {
    setState({ status: "working", error: null, message: "" });
    const payload = { ...body(), clientMutationId: mutationId() };
    try {
      const result = await applyDecision(projectId, payload);
      setDirty(false); setPreview(null); setState({ status: "success", error: null, message: `Saved as revision ${result.revision}.` });
      onCommitted(result);
    } catch (error) { setState({ status: error.code === "project_revision_conflict" ? "conflict" : "error", error, message: "" }); }
  }

  async function remove() {
    if (!window.confirm("Remove this decision and reopen its related review evidence?")) return;
    setState({ status: "working", error: null, message: "" });
    try {
      const result = await removeDecision(projectId, { targetId: target.targetId, kind, expectedRevision, clientMutationId: mutationId() });
      setDirty(false); onCommitted(result); onClose();
    } catch (error) { setState({ status: error.code === "project_revision_conflict" ? "conflict" : "error", error, message: "" }); }
  }

  async function reapprove() {
    if (!window.confirm("Reapprove this unchanged value against the current evidence?")) return;
    setState({ status: "working", error: null, message: "" });
    try {
      const result = await reapproveDecision(projectId, { targetId: target.targetId, kind, expectedRevision, clientMutationId: mutationId() });
      setDirty(false); onCommitted(result); onClose();
    } catch (error) { setState({ status: error.code === "project_revision_conflict" ? "conflict" : "error", error, message: "" }); }
  }

  const close = () => { if (!dirty || window.confirm("Discard the unsaved decision draft?")) onClose(); };
  const onKeyDown = (event) => {
    if (event.key === "Escape" && state.status !== "working") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
  };
  const current = selected.currentDecision;
  return (
    <div className="studio-decision-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section ref={dialog} className="studio-decision-drawer" role="dialog" aria-modal="true" aria-labelledby="decision-drawer-title" onKeyDown={onKeyDown}>
        <header><div><span className="studio-eyebrow">Durable project overlay</span><h2 id="decision-drawer-title">{target.label}</h2><p>{target.sourceRelativeLocator}</p></div><button type="button" className="studio-icon-button" aria-label="Close decision editor" onClick={close}><X aria-hidden="true" /></button></header>
        <div className="studio-inline-badges"><Badge>Revision {expectedRevision}</Badge><Badge tone={current?.stale ? "danger" : current ? "positive" : "warning"}>{current?.stale ? "Stale decision" : current ? current.approvalState : "Unresolved"}</Badge>{dirty && <Badge tone="warning">Unsaved changes</Badge>}</div>
        <Field label="Decision kind"><select value={kind} onChange={chooseKind}>{kinds.map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}</select></Field>
        <div className="studio-decision-evidence"><span>Detected evidence</span><strong>{String(selected.detectedValue ?? "Unresolved")}</strong><small>Dependencies and related reviews will be derived again by the local server.</small></div>
        <Field label="Decision value">{kind === "printed_page_number" ? <input type="number" min="1" max="9999" value={value} onChange={update(setValue)} /> : <select value={value} onChange={update(setValue)}>{selected.values.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>}</Field>
        <Field label="Approval state"><select value={approvalState} onChange={update(setApprovalState)}><option value="draft">Draft</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></Field>
        <Field label="Editor note"><textarea value={editorNote} maxLength={2000} rows={4} onChange={update(setEditorNote)} placeholder="Optional bounded publisher note" /></Field>
        {state.status === "conflict" && <div className="studio-decision-alert danger" role="alert"><AlertTriangle aria-hidden="true" /><div><strong>Project revision conflict</strong><p>Your draft is preserved. Reload current evidence before confirming; no automatic retry was made.</p></div></div>}
        {state.status === "error" && <div className="studio-decision-alert danger" role="alert"><AlertTriangle aria-hidden="true" /><div><strong>Decision not saved</strong><p>{state.error?.message}</p></div></div>}
        {state.message && <div className="studio-decision-alert positive" role="status" aria-live="polite"><CheckCircle2 aria-hidden="true" /><span>{state.message}</span></div>}
        {preview && <section className="studio-decision-preview" aria-label="Decision preview"><h3>Confirm preview</h3><dl><div><dt>Changed fields</dt><dd>{preview.changedFields.join(", ") || "None"}</dd></div><div><dt>Dependencies</dt><dd>{preview.dependencyCount}</dd></div><div><dt>Affected reviews</dt><dd>{preview.affectedReviews.length}</dd></div><div><dt>Result</dt><dd>{preview.resultingEffectiveStatus}</dd></div></dl>{preview.validationWarnings.map((warning) => <p key={warning}>{warning}</p>)}</section>}
        <footer><button type="button" className="studio-button secondary" disabled={state.status === "working"} onClick={runPreview}>Preview</button>{preview && <button type="button" className="studio-button primary" disabled={state.status === "working" || !preview.revisionMatches} onClick={commit}><Save aria-hidden="true" /> Confirm &amp; save</button>}{current?.stale && <button type="button" className="studio-button secondary" onClick={reapprove}>Reapprove evidence</button>}{current && <button type="button" className="studio-button danger" onClick={remove}><Trash2 aria-hidden="true" /> Remove</button>}</footer>
      </section>
    </div>
  );
}

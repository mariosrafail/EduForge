import { AlertTriangle, CheckCircle2, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { applyContentOverride, previewContentOverride, removeContentOverride, reapproveContentOverride } from "../bookBuilderApi.js";
import { Badge, Field } from "./StudioPrimitives.jsx";

const LONG_FIELDS = new Set(["activity_instruction_text", "question_prompt_text", "response_field_prompt_text"]);
const LIMITS = { activity_display_title: 300, activity_instruction_text: 4000, question_prompt_text: 4000, option_display_text: 1000, draggable_display_label: 1000, target_display_label: 1000, response_field_prompt_text: 4000 };

function mutationId() { return `mutation_${crypto.randomUUID()}`; }
function visible(value) { return value || "Missing from detected structure"; }

export function ContentOverrideDrawer({ projectId, expectedRevision, target, field, onCommitted, onClose }) {
  const [value, setValue] = useState(field.manualValue ?? field.detectedValue ?? "");
  const [approvalState, setApprovalState] = useState(["draft", "approved", "rejected"].includes(field.approvalState) ? field.approvalState : "draft");
  const [editorNote, setEditorNote] = useState(field.editorNote || "");
  const [preview, setPreview] = useState(null);
  const [state, setState] = useState({ status: "idle", error: null, message: "" });
  const [dirty, setDirty] = useState(false);
  const dialog = useRef(null);
  const returnFocus = useRef(document.activeElement);

  useEffect(() => {
    dialog.current?.querySelector("input, textarea, select, button")?.focus();
    return () => returnFocus.current?.focus?.();
  }, []);
  useEffect(() => {
    const warning = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warning);
    return () => window.removeEventListener("beforeunload", warning);
  }, [dirty]);

  const update = (setter) => (event) => {
    setter(event.target.value); setDirty(true); setPreview(null); setState({ status: "idle", error: null, message: "" });
  };
  const body = () => ({ targetId: target.targetId, kind: field.kind, value, approvalState, editorNote, expectedRevision, clientMutationId: mutationId() });
  const fail = (error) => setState({ status: error.code === "project_revision_conflict" ? "conflict" : "error", error, message: "" });

  async function runPreview() {
    setState({ status: "working", error: null, message: "" });
    try { setPreview(await previewContentOverride(projectId, body())); setState({ status: "idle", error: null, message: "Preview ready. No project data was written." }); } catch (error) { fail(error); }
  }
  async function commit() {
    setState({ status: "working", error: null, message: "" });
    try {
      const result = await applyContentOverride(projectId, { ...body(), clientMutationId: mutationId() });
      setDirty(false); setPreview(null); setState({ status: "success", error: null, message: `Saved as revision ${result.revision}.` }); onCommitted(result);
    } catch (error) { fail(error); }
  }
  async function remove() {
    if (!window.confirm("Remove this manual value and return to detected or missing content?")) return;
    setState({ status: "working", error: null, message: "" });
    try { const result = await removeContentOverride(projectId, { targetId: target.targetId, kind: field.kind, expectedRevision, clientMutationId: mutationId() }); setDirty(false); onCommitted(result); onClose(); } catch (error) { fail(error); }
  }
  async function reapprove() {
    if (!window.confirm("Reapprove this unchanged manual value against the current field evidence?")) return;
    setState({ status: "working", error: null, message: "" });
    try { const result = await reapproveContentOverride(projectId, { targetId: target.targetId, kind: field.kind, expectedRevision, clientMutationId: mutationId() }); setDirty(false); onCommitted(result); onClose(); } catch (error) { fail(error); }
  }
  const close = () => { if (!dirty || window.confirm("Discard the unsaved manual content draft?")) onClose(); };
  const onKeyDown = (event) => {
    if (event.key === "Escape" && state.status !== "working") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
  };
  const input = LONG_FIELDS.has(field.kind)
    ? <textarea value={value} maxLength={LIMITS[field.kind]} rows={7} onChange={update(setValue)} />
    : <input value={value} maxLength={LIMITS[field.kind]} onChange={update(setValue)} />;

  return <div className="studio-decision-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={dialog} className="studio-decision-drawer studio-content-override-drawer" role="dialog" aria-modal="true" aria-labelledby="content-override-title" onKeyDown={onKeyDown}>
      <header><div><span className="studio-eyebrow">Manual Student-safe content override</span><h2 id="content-override-title">{target.label}</h2><p>{target.sourceRelativeLocator}</p></div><button type="button" className="studio-icon-button" aria-label="Close content override editor" onClick={close}><X aria-hidden="true" /></button></header>
      <div className="studio-content-boundary-banner" role="note"><strong>Existing structure only</strong><span>This changes one display string. It cannot create, delete or reorder nodes and never opens answers, Teacher solutions or scoring.</span></div>
      <div className="studio-inline-badges"><Badge>Revision {expectedRevision}</Badge><Badge>{field.kind.replaceAll("_", " ")}</Badge><Badge tone={field.stale ? "danger" : field.decisionId ? "positive" : "warning"}>{field.stale ? "Stale manual value" : field.decisionId ? field.approvalState : "No manual value"}</Badge>{dirty && <Badge tone="warning">Unsaved changes</Badge>}</div>
      <dl className="studio-content-value-grid"><div><dt>Detected</dt><dd>{visible(field.detectedValue)}</dd></div><div><dt>Saved manual</dt><dd>{visible(field.manualValue)}</dd></div><div><dt>Effective now</dt><dd>{visible(field.effectiveValue)}</dd><small>{field.valueOrigin.replaceAll("_", " ")}</small></div></dl>
      <Field label={target.label}>{input}<small>{value.length.toLocaleString()} / {LIMITS[field.kind].toLocaleString()} characters</small></Field>
      <Field label="Approval state"><select value={approvalState} onChange={update(setApprovalState)}><option value="draft">Draft</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></Field>
      <Field label="Editor note"><textarea value={editorNote} maxLength={2000} rows={3} onChange={update(setEditorNote)} placeholder="Optional bounded publisher note" /></Field>
      {field.stale && <div className="studio-decision-alert danger" role="alert"><AlertTriangle aria-hidden="true" /><div><strong>Source evidence changed</strong><p>The manual value is preserved but is not effective until explicitly reapproved.</p></div></div>}
      {state.status === "conflict" && <div className="studio-decision-alert danger" role="alert"><AlertTriangle aria-hidden="true" /><div><strong>Project revision conflict</strong><p>Your text remains in this editor. Reload current evidence before confirming; no automatic retry occurred.</p></div></div>}
      {state.status === "error" && <div className="studio-decision-alert danger" role="alert"><AlertTriangle aria-hidden="true" /><div><strong>Content override not saved</strong><p>{state.error?.message}</p></div></div>}
      {state.message && <div className="studio-decision-alert positive" role="status" aria-live="polite"><CheckCircle2 aria-hidden="true" /><span>{state.message}</span></div>}
      {preview?.contentOverride && <section className="studio-decision-preview" aria-label="Content override preview"><h3>Confirm exact field update</h3><dl><div><dt>Detected / missing</dt><dd>{visible(preview.contentOverride.detectedValue)}</dd></div><div><dt>Proposed effective</dt><dd>{visible(preview.contentOverride.effectiveValue)}</dd></div><div><dt>Length</dt><dd>{preview.contentOverride.characterCount} characters · {preview.contentOverride.utf8ByteCount} UTF-8 bytes</dd></div><div><dt>Evidence</dt><dd>{preview.dependencyCount} exact dependencies</dd></div><div><dt>Reviews</dt><dd>{preview.affectedReviews.length} affected</dd></div></dl>{preview.validationWarnings.map((warning) => <p key={warning}>{warning}</p>)}</section>}
      <footer><button type="button" className="studio-button secondary" disabled={state.status === "working"} onClick={runPreview}>Preview</button>{preview && <button type="button" className="studio-button primary" disabled={state.status === "working" || !preview.revisionMatches} onClick={commit}><Save aria-hidden="true" /> Confirm &amp; save</button>}{field.stale && <button type="button" className="studio-button secondary" onClick={reapprove}><RotateCcw aria-hidden="true" /> Reapprove</button>}{field.decisionId && <button type="button" className="studio-button danger" onClick={remove}><Trash2 aria-hidden="true" /> Remove</button>}</footer>
    </section>
  </div>;
}

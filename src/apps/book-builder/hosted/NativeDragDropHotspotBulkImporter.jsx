import { useId, useState } from "react";
import { Eraser, ScanLine } from "lucide-react";

import { StudioButton } from "../../../components/builder-studio/StudioControls.jsx";
import { NATIVE_DRAG_DROP_HOTSPOT_BULK_MAX_CHARACTERS } from "../../../data/native-activities/nativeDragDropHotspotBulkAuthoring.js";
import "./nativeSingleChoiceHotspotBulkImporter.css";

const example = `SOURCE 1024x582

PANEL 1
TARGET 1 items=1|3 x=665 y=234 width=140 height=40
TARGET 2 items=2 x=581 y=280 width=140 height=40`;

export function NativeDragDropHotspotBulkImporter({ hasExistingTargets, onPreview, onApply }) {
  const id = useId();
  const [source, setSource] = useState("");
  const [mode, setMode] = useState("append");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const previewTargets = () => {
    setError(""); setPreview(null);
    try { setPreview(onPreview(source, { mode })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Targets could not be previewed."); }
  };
  const apply = () => {
    setError("");
    try { const result = onApply(source, { mode }); setPreview(result); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Targets could not be imported."); }
  };
  const clear = () => { setSource(""); setError(""); setPreview(null); };
  return <details className="native-hotspot-bulk-importer">
    <summary><ScanLine aria-hidden="true" /> Bulk import drop targets from text</summary>
    <div className="native-hotspot-bulk-importer__body">
      <div className="native-hotspot-bulk-importer__instructions">
        <p>SOURCE defines the original page coordinate system; PANEL uses current panel order.</p>
        <p>TARGET numbers identify rows. <code>items=1|3</code> maps current bank items 1 and 3. A stable item ID may replace a number.</p>
        <p>Coordinates that cross a SOURCE edge are clipped with a warning. Completely outside targets are errors.</p>
        <p>Preview resolves every item reference without changing the draft. Apply updates public geometry and private mappings atomically.</p>
      </div>
      <pre aria-label="Drag and Drop target geometry format example">{example}</pre>
      <label htmlFor={`${id}-source`}><span>Paste target geometry</span><textarea id={`${id}-source`} rows={12} maxLength={NATIVE_DRAG_DROP_HOTSPOT_BULK_MAX_CHARACTERS} value={source} onChange={(event) => { setSource(event.target.value); setError(""); setPreview(null); }} placeholder={example} /></label>
      <fieldset><legend>Import mode</legend><label><input type="radio" name={`${id}-mode`} value="append" checked={mode === "append"} onChange={() => { setMode("append"); setPreview(null); }} /> Append targets</label><label><input type="radio" name={`${id}-mode`} value="replace" checked={mode === "replace"} onChange={() => { setMode("replace"); setPreview(null); }} /> Replace targets on listed panels</label></fieldset>
      {hasExistingTargets && mode === "replace" ? <p className="native-hotspot-bulk-importer__warning">Replace removes stale private mappings for targets deleted from each listed panel.</p> : null}
      {error ? <div className="native-hotspot-bulk-importer__message is-error" role="alert"><strong>Targets were not imported.</strong><span>{error}</span></div> : null}
      {preview ? <div className="native-hotspot-bulk-importer__message is-success" role="status"><strong>{preview.summary.headline}</strong><ul><li>SOURCE {preview.summary.sourceDimensions.width} × {preview.summary.sourceDimensions.height}</li><li>{preview.summary.panelsUpdated} panel{preview.summary.panelsUpdated === 1 ? "" : "s"}; {preview.summary.mode} mode</li><li>{preview.summary.preservedIds} existing ID{preview.summary.preservedIds === 1 ? "" : "s"} preserved; {preview.summary.createdIds} new ID{preview.summary.createdIds === 1 ? "" : "s"}</li><li>{preview.summary.removedTargets} stale target{preview.summary.removedTargets === 1 ? "" : "s"} removed</li></ul>{preview.summary.rows.map((row) => <p key={`${row.line}-${row.targetId}`}><strong>Line {row.line}, Panel {row.panelOrdinal}, Target {row.targetOrdinal}:</strong> {row.items.map((item) => `${item.reference} → ${item.shortLabel} (${item.text})`).join("; ")}</p>)}{preview.summary.warnings.map((warning) => <p className="native-hotspot-bulk-importer__warning" key={warning}>{warning}</p>)}</div> : null}
      <div className="native-hotspot-bulk-importer__actions"><StudioButton type="button" variant="ghost" disabled={!source.trim()} onClick={previewTargets}><ScanLine aria-hidden="true" /> Preview targets</StudioButton><StudioButton type="button" variant="primary" disabled={!preview} reason="Preview and resolve every row first" onClick={apply}>Apply {mode}</StudioButton><StudioButton type="button" variant="ghost" disabled={!source && !error && !preview} onClick={clear}><Eraser aria-hidden="true" /> Clear source</StudioButton></div>
    </div>
  </details>;
}

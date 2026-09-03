import { useId, useState } from "react";
import { Eraser, ScanLine } from "lucide-react";

import { StudioButton } from "../../../components/builder-studio/StudioControls.jsx";
import { NATIVE_SINGLE_CHOICE_HOTSPOT_BULK_MAX_CHARACTERS } from "../../../data/native-activities/nativeSingleChoiceHotspotBulkAuthoring.js";
import "./nativeSingleChoiceHotspotBulkImporter.css";

const example = `SOURCE 1024x582

PANEL 1
1.1 x=120 y=185 width=190 height=30
1.2 x=315 y=185 width=170 height=30
1.3 x=490 y=185 width=180 height=30

PANEL 2
2.1 x=140 y=240 width=160 height=30
2.2 x=305 y=240 width=190 height=30
2.3 x=500 y=240 width=150 height=30`;

export function NativeSingleChoiceHotspotBulkImporter({ hasExistingHotspots, onImport }) {
  const id = useId();
  const [source, setSource] = useState("");
  const [replaceExistingPanels, setReplaceExistingPanels] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const importHotspots = () => {
    setError(""); setSummary(null);
    try {
      const result = onImport(source, { replaceExistingPanels });
      setSummary(result.summary);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Hotspots could not be imported."); }
  };
  const clear = () => { setSource(""); setError(""); setSummary(null); };
  const blocked = !source.trim();
  return <details className="native-hotspot-bulk-importer">
    <summary><ScanLine aria-hidden="true" /> Bulk import hotspots from text</summary>
    <div className="native-hotspot-bulk-importer__body">
      <div className="native-hotspot-bulk-importer__instructions">
        <p>SOURCE defines the coordinate system used by the original page or XML.</p>
        <p>PANEL numbers use the current panel order. 1.3 means current Question 1, Option 3.</p>
        <p>Upload each panel background before importing.</p>
        <p>Different resolutions are scaled automatically. Cropped or reflowed images may need manual adjustment.</p>
        <p>The pasted source is not saved; only generated hotspot geometry is stored.</p>
      </div>
      <pre aria-label="Multiple Choice hotspot geometry format example">{example}</pre>
      <label htmlFor={`${id}-source`}><span>Paste hotspot geometry</span><textarea id={`${id}-source`} rows={12} maxLength={NATIVE_SINGLE_CHOICE_HOTSPOT_BULK_MAX_CHARACTERS} value={source} onChange={(event) => { setSource(event.target.value); setError(""); setSummary(null); }} placeholder={example} /></label>
      {hasExistingHotspots ? <label className="native-hotspot-bulk-importer__replace"><input type="checkbox" checked={replaceExistingPanels} onChange={(event) => setReplaceExistingPanels(event.target.checked)} /> <span><strong>Replace existing hotspots on listed panels</strong><small>Only panels named in the pasted document are replaced. Hotspots on other panels are left unchanged.</small></span></label> : null}
      {error ? <div className="native-hotspot-bulk-importer__message is-error" role="alert"><strong>Hotspots were not imported.</strong><span>{error}</span></div> : null}
      {summary ? <div className="native-hotspot-bulk-importer__message is-success" role="status"><strong>{summary.headline}</strong><ul><li>SOURCE {summary.sourceDimensions.width} × {summary.sourceDimensions.height}</li><li>{summary.panelsUpdated} panel{summary.panelsUpdated === 1 ? "" : "s"} updated</li><li>{summary.preservedIds} existing ID{summary.preservedIds === 1 ? "" : "s"} preserved; {summary.createdIds} new ID{summary.createdIds === 1 ? "" : "s"} created</li><li>{summary.removedHotspots} old listed-panel hotspot{summary.removedHotspots === 1 ? "" : "s"} removed</li><li>{summary.missingOptions} option{summary.missingOptions === 1 ? "" : "s"} still need hotspots</li></ul>{summary.warnings.map((warning) => <p className="native-hotspot-bulk-importer__warning" key={warning}>{warning}</p>)}<span>Fine-tune the imported geometry, then use Save Draft when ready.</span></div> : null}
      <div className="native-hotspot-bulk-importer__actions"><StudioButton type="button" variant="primary" disabled={blocked} reason="Paste hotspot geometry first" onClick={importHotspots}><ScanLine aria-hidden="true" /> Import hotspots</StudioButton><StudioButton type="button" variant="ghost" disabled={!source && !error && !summary} onClick={clear}><Eraser aria-hidden="true" /> Clear source</StudioButton></div>
    </div>
  </details>;
}

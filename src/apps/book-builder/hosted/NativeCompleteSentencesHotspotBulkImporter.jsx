import { useId, useState } from "react";
import { Eraser, ScanLine } from "lucide-react";

import { StudioButton } from "../../../components/builder-studio/StudioControls.jsx";
import { NATIVE_COMPLETE_SENTENCES_HOTSPOT_BULK_MAX_CHARACTERS } from "../../../data/native-activities/nativeCompleteSentencesHotspotBulkAuthoring.js";
import "./nativeSingleChoiceHotspotBulkImporter.css";

const example = `SOURCE 1024x582

PANEL 1
ITEM 1 x=665 y=234 width=140 height=27
ITEM 2 x=581 y=280 width=140 height=27
ITEM 3 x=429 y=324 width=139 height=27
ITEM 4 x=739 y=367 width=140 height=27

PANEL 2
ITEM 5 x=271 y=234 width=140 height=27
ITEM 6 x=109 y=280 width=140 height=27
ITEM 7 x=148 y=322 width=139 height=27
ITEM 8 x=523 y=367 width=140 height=27`;

export function NativeCompleteSentencesHotspotBulkImporter({ hasExistingHotspots, onImport }) {
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
        <p>PANEL numbers use the current panel order.</p>
        <p>ITEM 3 means current Sentence 3 in Builder order.</p>
        <p>ITEM numbers do not necessarily match the printed exercise numbers.</p>
        <p>Upload each referenced panel background before importing.</p>
        <p>Different resolutions are scaled automatically. Cropped or reflowed images may need manual adjustment.</p>
        <p>The pasted source is not saved; only generated hotspot geometry is stored.</p>
      </div>
      <pre aria-label="Complete the Sentences hotspot geometry format example">{example}</pre>
      <label htmlFor={`${id}-source`}><span>Paste hotspot geometry</span><textarea id={`${id}-source`} rows={14} maxLength={NATIVE_COMPLETE_SENTENCES_HOTSPOT_BULK_MAX_CHARACTERS} value={source} onChange={(event) => { setSource(event.target.value); setError(""); setSummary(null); }} placeholder={example} /></label>
      {hasExistingHotspots ? <label className="native-hotspot-bulk-importer__replace" htmlFor={`${id}-replace`}><input id={`${id}-replace`} type="checkbox" checked={replaceExistingPanels} aria-describedby={`${id}-replace-help`} onChange={(event) => setReplaceExistingPanels(event.target.checked)} /> <span><strong>Replace existing hotspots on listed panels</strong><small id={`${id}-replace-help`}>Only panels named in the pasted document are replaced. Hotspots on other panels are left unchanged.</small></span></label> : null}
      {error ? <div className="native-hotspot-bulk-importer__message is-error" role="alert"><strong>Hotspots were not imported.</strong><span>{error}</span></div> : null}
      {summary ? <div className="native-hotspot-bulk-importer__message is-success" role="status"><strong>{summary.headline}</strong><ul><li>SOURCE {summary.sourceDimensions.width} × {summary.sourceDimensions.height}</li><li>{summary.panelsUpdated} panel{summary.panelsUpdated === 1 ? "" : "s"} updated</li><li>{summary.preservedIds} existing ID{summary.preservedIds === 1 ? "" : "s"} preserved; {summary.createdIds} new ID{summary.createdIds === 1 ? "" : "s"} created</li><li>{summary.removedHotspots} old listed-panel hotspot{summary.removedHotspots === 1 ? "" : "s"} removed</li><li>{summary.missingItems} item{summary.missingItems === 1 ? "" : "s"} still need hotspots</li></ul>{summary.warnings.map((warning) => <p className="native-hotspot-bulk-importer__warning" key={warning}>{warning}</p>)}<span>Fine-tune the imported geometry, then use Save Draft when ready.</span></div> : null}
      <div className="native-hotspot-bulk-importer__actions"><StudioButton type="button" variant="primary" disabled={blocked} reason="Paste hotspot geometry first" onClick={importHotspots}><ScanLine aria-hidden="true" /> Import hotspots</StudioButton><StudioButton type="button" variant="ghost" disabled={!source && !error && !summary} onClick={clear}><Eraser aria-hidden="true" /> Clear source</StudioButton></div>
    </div>
  </details>;
}

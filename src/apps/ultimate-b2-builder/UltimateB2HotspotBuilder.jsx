import { useEffect, useMemo, useState } from "react";
import { Save, Scan, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { EditableHotspotLayer } from "../../components/lms/books/BookPageImagePanel.jsx";
import {
  ultimateB2StudentsBookAuthoringActivities,
  ultimateB2StudentsBookAuthoringPages,
} from "../../data/ultimate-b2/studentsBookAuthoringCatalog.js";
import { getUltimateB2UnitPartAsset } from "../../data/ultimate-b2/ultimateB2PageAssets.offline.js";

const endpoint = "/__hhplms/ultimate-b2-hotspots";
const emptyManifest = {
  schemaVersion: "1.0",
  packageSlug: "ultimate-b2",
  componentSlug: "students-book",
  pages: {},
};

function pageLabel(page) {
  const prefix = page.pageNumbers.length > 1 ? `Pages ${page.spreadNumber}` : `Page ${page.pageNumber}`;
  return `${prefix} — ${page.sectionTitle}`;
}

function newHotspotId() {
  if (globalThis.crypto?.randomUUID) return `hotspot-${globalThis.crypto.randomUUID()}`;
  return `hotspot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isTextEditingTarget(target) {
  return target instanceof HTMLElement && (
    target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)
  );
}

export function UltimateB2HotspotBuilder() {
  const [manifest, setManifest] = useState(emptyManifest);
  const [unitNumber, setUnitNumber] = useState(1);
  const unitPages = useMemo(() => ultimateB2StudentsBookAuthoringPages.filter((page) => page.unitNumber === unitNumber), [unitNumber]);
  const [pageId, setPageId] = useState(ultimateB2StudentsBookAuthoringPages[0]?.id || "");
  const [selectedHotspotId, setSelectedHotspotId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [fitToScreen, setFitToScreen] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [customLabels, setCustomLabels] = useState(() => new Set());
  const page = ultimateB2StudentsBookAuthoringPages.find((candidate) => candidate.id === pageId) || unitPages[0];
  const hotspots = manifest.pages?.[page?.id] || [];
  const selectedHotspot = hotspots.find((hotspot) => hotspot.id === selectedHotspotId) || null;
  const pageImage = page ? getUltimateB2UnitPartAsset(page.unitNumber, page.partNumber) : null;
  const currentPageActivities = ultimateB2StudentsBookAuthoringActivities.filter((activity) => (
    activity.unitNumber === page?.unitNumber && activity.pageSpread === page?.spreadNumber
  ));
  const otherActivities = ultimateB2StudentsBookAuthoringActivities.filter((activity) => !currentPageActivities.includes(activity));

  useEffect(() => {
    let mounted = true;
    fetch(endpoint, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Hotspots could not be loaded.");
        return payload;
      })
      .then((payload) => {
        if (!mounted) return;
        setManifest(payload);
        setStatus("Ready");
      })
      .catch((requestError) => {
        if (!mounted) return;
        setError(requestError.message);
        setStatus("Load failed");
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const beforeUnload = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  useEffect(() => {
    const deleteWithKeyboard = (event) => {
      if (!selectedHotspotId || isTextEditingTarget(event.target)) return;
      if (!["Delete", "Backspace"].includes(event.key)) return;
      event.preventDefault();
      setManifest((current) => ({
        ...current,
        pages: {
          ...current.pages,
          [page.id]: (current.pages[page.id] || []).filter((hotspot) => hotspot.id !== selectedHotspotId),
        },
      }));
      setSelectedHotspotId(null);
      setDirty(true);
      setStatus("Unsaved changes");
    };
    window.addEventListener("keydown", deleteWithKeyboard);
    return () => window.removeEventListener("keydown", deleteWithKeyboard);
  }, [page?.id, selectedHotspotId]);

  useEffect(() => {
    if (page && page.unitNumber !== unitNumber) setPageId(unitPages[0]?.id || "");
    setSelectedHotspotId(null);
    setNaturalSize({ width: 0, height: 0 });
  }, [pageId, unitNumber]);

  const updatePageHotspots = (nextHotspots) => {
    setManifest((current) => ({ ...current, pages: { ...current.pages, [page.id]: nextHotspots } }));
    setDirty(true);
    setStatus("Unsaved changes");
    setError("");
  };

  const updateSelectedHotspot = (patch) => {
    updatePageHotspots(hotspots.map((hotspot) => hotspot.id === selectedHotspotId ? { ...hotspot, ...patch } : hotspot));
  };

  const deleteSelectedHotspot = () => {
    if (!selectedHotspotId) return;
    updatePageHotspots(hotspots.filter((hotspot) => hotspot.id !== selectedHotspotId));
    setSelectedHotspotId(null);
  };

  const selectActivity = (activityKey) => {
    const activity = ultimateB2StudentsBookAuthoringActivities.find((candidate) => candidate.activityKey === activityKey);
    const previous = ultimateB2StudentsBookAuthoringActivities.find((candidate) => candidate.activityKey === selectedHotspot.activityKey);
    const shouldFillLabel = !customLabels.has(selectedHotspot.id)
      && (!selectedHotspot.label || selectedHotspot.label === "Clickable area" || selectedHotspot.label === previous?.title);
    updateSelectedHotspot({
      activityKey,
      actionType: "normalized_activity",
      ...(shouldFillLabel && activity ? { label: activity.title } : {}),
    });
  };

  const save = async () => {
    setStatus("Saving…");
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manifest),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Hotspots could not be saved.");
      setManifest(payload);
      setDirty(false);
      setStatus("Saved");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("Save failed");
    }
  };

  if (!page) return <main className="hotspot-builder"><p>No Unit 1 or Unit 2 pages were found.</p></main>;

  return (
    <main className="hotspot-builder">
      <header className="builder-header">
        <div>
          <span>Internal authoring utility</span>
          <h1>Students Book hotspot builder</h1>
        </div>
        <div className="builder-save-state" role="status" data-dirty={dirty || undefined}>
          <strong>{status}</strong>
          {error && <small>{error}</small>}
          <button type="button" onClick={save} disabled={!dirty || status === "Saving…"}><Save size={17} /> Save</button>
        </div>
      </header>

      <section className="builder-controls" aria-label="Book and page controls">
        <label>Book<input readOnly value="Ultimate B2" /></label>
        <label>Component<input readOnly value="Students Book" /></label>
        <label>Unit
          <select value={unitNumber} onChange={(event) => {
            const nextUnit = Number(event.target.value);
            setUnitNumber(nextUnit);
            setPageId(ultimateB2StudentsBookAuthoringPages.find((candidate) => candidate.unitNumber === nextUnit)?.id || "");
          }}>
            <option value="1">Unit 1</option>
            <option value="2">Unit 2</option>
          </select>
        </label>
        <label>Page / Spread
          <select value={page.id} onChange={(event) => setPageId(event.target.value)}>
            {unitPages.map((candidate) => <option key={candidate.id} value={candidate.id}>{pageLabel(candidate)}</option>)}
          </select>
        </label>
        <div className="builder-zoom" aria-label="Page zoom controls">
          <button type="button" onClick={() => { setFitToScreen(false); setZoom((value) => Math.max(0.6, value - 0.2)); }} aria-label="Zoom out"><ZoomOut size={18} /></button>
          <button type="button" className={fitToScreen ? "selected" : ""} onClick={() => { setFitToScreen(true); setZoom(1); }}><Scan size={18} /> Fit</button>
          <button type="button" onClick={() => { setFitToScreen(false); setZoom((value) => Math.min(2.4, value + 0.2)); }} aria-label="Zoom in"><ZoomIn size={18} /></button>
          <output>{Math.round(zoom * 100)}%</output>
        </div>
      </section>

      <section className="builder-workspace">
        <div className="builder-canvas-scroll">
          <div
            className={`builder-page-surface ${fitToScreen ? "fit" : "zoomed"}`}
            style={{
              width: naturalSize.width ? `${naturalSize.width * (fitToScreen ? 1 : zoom)}px` : "100%",
              maxWidth: fitToScreen ? "100%" : "none",
            }}
          >
            <img
              src={pageImage}
              alt={`${pageLabel(page)} Students Book page`}
              draggable="false"
              onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            />
            <EditableHotspotLayer
              pageId={page.id}
              areas={hotspots}
              editing
              selectedAreaId={selectedHotspotId}
              onSelectArea={setSelectedHotspotId}
              onChangeAreas={updatePageHotspots}
              createArea={(geometry) => ({
                id: newHotspotId(),
                unitNumber: page.unitNumber,
                pageId: page.id,
                pageNumber: page.pageNumber,
                ...geometry,
                label: "Clickable area",
                actionType: "normalized_activity",
                activityKey: "",
              })}
            />
          </div>
        </div>

        <aside className="builder-properties">
          <h2>Hotspot properties</h2>
          {!selectedHotspot ? <p>Drag on the page to create a hotspot, or select an existing rectangle.</p> : (
            <>
              <label>Activity
                <select value={selectedHotspot.activityKey || ""} onChange={(event) => selectActivity(event.target.value)}>
                  <option value="">Choose an implemented activity…</option>
                  {currentPageActivities.length > 0 && <optgroup label={`Current ${pageLabel(page)}`}>
                    {currentPageActivities.map((activity) => <option key={activity.activityKey} value={activity.activityKey}>{activity.title}</option>)}
                  </optgroup>}
                  {[1, 2].map((unit) => (
                    <optgroup key={unit} label={`Unit ${unit}`}>
                      {otherActivities.filter((activity) => activity.unitNumber === unit).map((activity) => (
                        <option key={activity.activityKey} value={activity.activityKey}>{activity.pageLabel} — {activity.title}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>Label
                <input value={selectedHotspot.label || ""} onChange={(event) => {
                  setCustomLabels((current) => new Set(current).add(selectedHotspot.id));
                  updateSelectedHotspot({ label: event.target.value });
                }} />
              </label>
              <div className="builder-stable-id">
                <span>Stable normalized activity id</span>
                <code>{selectedHotspot.activityKey || "Not assigned"}</code>
              </div>
              <dl>
                <div><dt>Left</dt><dd>{selectedHotspot.left.toFixed(2)}%</dd></div>
                <div><dt>Top</dt><dd>{selectedHotspot.top.toFixed(2)}%</dd></div>
                <div><dt>Width</dt><dd>{selectedHotspot.width.toFixed(2)}%</dd></div>
                <div><dt>Height</dt><dd>{selectedHotspot.height.toFixed(2)}%</dd></div>
              </dl>
              <button className="builder-delete" type="button" onClick={deleteSelectedHotspot}><Trash2 size={17} /> Delete hotspot</button>
              <small>Delete and Backspace also remove the selected hotspot when you are not typing.</small>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}

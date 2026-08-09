import { Play, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { EditableHotspotLayer } from "../../components/lms/books/BookPageImagePanel.jsx";
import { findListeningCue, findListeningScrollEntry, formatListeningTime } from "../../components/lms/activities/ultimate-b2/listeningRuntime.js";
import { ultimateB2Unit1Part2LegacyImages } from "../../data/ultimate-b2/unit1Part2LegacyPilotAssets.js";
import { ultimateB2Unit1Part2LegacyAudio } from "../../data/ultimate-b2/unit1Part2LegacyPilotAudio.offline.js";
import { validateUltimateB2ListeningAuthoring } from "../../data/ultimate-b2/listeningAuthoringSchema.js";
import fullReadingAudio from "../../assets/books/ultimate-b2/teacher-offline-media/unit-1-reading-text.mp3";

const endpoint = "/__hhplms/ultimate-b2-listening-authoring";
const activityId = "ultimate-b2-sb-u1-p2-o2";
const images = ultimateB2Unit1Part2LegacyImages[activityId];
const sectionNames = ["Overview", "Question Segments", "Karaoke Timeline", "Preview"];

function cueText(authoring, cue) {
  const byId = new Map(authoring.karaoke.fragments.map((fragment) => [fragment.id, fragment]));
  return cue.fragmentIds.map((id) => byId.get(id)?.runs.map((run) => run.text).join("") || "").join(" ").replace(/\s+/g, " ").trim();
}

function parseTime(value) {
  const match = String(value).trim().match(/^(?:(\d+):)?(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!match) return Number.NaN;
  const minutes = Number(match[1] || 0);
  const seconds = Number(match[2]);
  const milliseconds = Number((match[3] || "").padEnd(3, "0"));
  return minutes * 60_000 + seconds * 1_000 + milliseconds;
}

function SegmentRegionEditor({ authoring, segmentIndex, previewing, selectedRegionId, onSelectRegion, onChangeRegions }) {
  const segment = authoring.questionSegments[segmentIndex];
  const { width, height } = authoring.staticText.surface;
  const editorRef = useRef(null);
  const areas = segment.regions.map((region) => ({
    id: region.id,
    label: region.id,
    left: region.x / width * 100,
    top: region.y / height * 100,
    width: region.width / width * 100,
    height: region.height / height * 100,
  }));
  useEffect(() => {
    if (!previewing || !editorRef.current || !segment.regions.length) return;
    const surface = editorRef.current.querySelector(".listening-region-surface");
    const scale = surface?.clientWidth ? surface.clientWidth / width : 1;
    editorRef.current.scrollTo({ top: Math.max(0, segment.regions[0].y * scale - 60), behavior: "smooth" });
  }, [previewing, segmentIndex, width]);
  return (
    <div className="listening-region-editor" ref={editorRef}>
      <div className="listening-region-surface" style={{ aspectRatio: `${width} / ${height}` }}>
        <img src={images.readingText} alt="Static reading text" draggable="false" />
        <EditableHotspotLayer
          pageId={`listening-segment-${segmentIndex + 1}`}
          areas={areas}
          editing
          selectedAreaId={selectedRegionId}
          onSelectArea={onSelectRegion}
          onChangeAreas={(nextAreas) => onChangeRegions(nextAreas.map((area) => ({
            id: area.id,
            x: Math.round(area.left / 100 * width),
            y: Math.round(area.top / 100 * height),
            width: Math.max(1, Math.round(area.width / 100 * width)),
            height: Math.max(1, Math.round(area.height / 100 * height)),
          })))}
          createArea={(geometry) => ({ id: `region-${Date.now()}`, label: "New region", ...geometry })}
        />
      </div>
    </div>
  );
}

function SafeRuns({ runs }) {
  return runs.map((run, index) => run.style === "italic" ? <i key={index}>{run.text}</i> : run.style === "bold" ? <b key={index}>{run.text}</b> : <span key={index}>{run.text}</span>);
}

function KaraokePreview({ authoring, currentMs, viewportRef }) {
  const activeCue = findListeningCue(authoring.karaoke.cues, currentMs);
  const activeIds = useMemo(() => new Set(activeCue?.fragmentIds || []), [activeCue]);
  useEffect(() => {
    const entry = findListeningScrollEntry(authoring.karaoke.scrollTimeline, currentMs);
    if (viewportRef.current) viewportRef.current.scrollTop = (entry?.scrollY || 0) * 0.5;
  }, [authoring, currentMs, viewportRef]);
  return (
    <div className="listening-builder-karaoke-viewport" ref={viewportRef}>
      <div className="listening-builder-karaoke-scaled" style={{ width: authoring.karaoke.content.width / 2, height: authoring.karaoke.content.height / 2 }}>
        <div className="listening-builder-karaoke-canvas" style={{ width: authoring.karaoke.content.width, height: authoring.karaoke.content.height }}>
          <img src={images.background} alt="" style={authoring.karaoke.background} draggable="false" />
          {authoring.karaoke.fragments.map((fragment) => (
            <span key={fragment.id} className={activeIds.has(fragment.id) ? "active" : ""} style={{ left: fragment.x, top: fragment.y, width: fragment.width, height: fragment.height }}>
              <SafeRuns runs={fragment.runs} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function UltimateB2ListeningBuilder() {
  const [authoring, setAuthoring] = useState(null);
  const [section, setSection] = useState(sectionNames[0]);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [previewSegment, setPreviewSegment] = useState(null);
  const [selectedCueId, setSelectedCueId] = useState("cue-1");
  const [currentMs, setCurrentMs] = useState(0);
  const segmentAudioRef = useRef(null);
  const fullAudioRef = useRef(null);
  const previewViewportRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    fetch(endpoint, { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Listening authoring could not be loaded.");
      return payload;
    }).then((payload) => {
      if (!mounted) return;
      setAuthoring(payload);
      setStatus("Saved");
    }).catch((requestError) => {
      if (!mounted) return;
      setStatus("Load failed");
      setError(requestError.message);
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
    if (previewSegment === null || !segmentAudioRef.current) return;
    segmentAudioRef.current.currentTime = 0;
    segmentAudioRef.current.play().catch(() => setError("Segment preview could not be played."));
  }, [previewSegment]);

  const change = (updater) => {
    setAuthoring((current) => {
      const next = structuredClone(current);
      updater(next);
      return next;
    });
    setDirty(true);
    setStatus("Unsaved changes");
    setError("");
  };

  const save = async () => {
    const validation = validateUltimateB2ListeningAuthoring(authoring);
    if (!validation.ok) {
      setStatus("Save failed");
      setError(validation.errors[0]);
      return;
    }
    setStatus("Saving");
    setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(authoring) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Listening authoring could not be saved.");
      setAuthoring(payload);
      setDirty(false);
      setStatus("Saved");
    } catch (requestError) {
      setStatus("Save failed");
      setError(requestError.message);
    }
  };

  if (!authoring) return <section className="listening-builder"><p>{error || status}</p></section>;
  const selectedCueIndex = Math.max(0, authoring.karaoke.cues.findIndex((cue) => cue.id === selectedCueId));
  const selectedCue = authoring.karaoke.cues[selectedCueIndex];
  const selectedSegment = authoring.questionSegments[segmentIndex];
  const segmentSource = previewSegment === null ? null : ultimateB2Unit1Part2LegacyAudio[authoring.questionSegments[previewSegment].audioLogicalKey]?.localUrl;

  const updateCueTime = (field, value) => change((next) => { next.karaoke.cues[selectedCueIndex][field] = value; });
  const player = (
    <audio
      ref={fullAudioRef}
      controls
      src={fullReadingAudio}
      onTimeUpdate={(event) => setCurrentMs(Math.round(event.currentTarget.currentTime * 1000))}
      onSeeked={(event) => setCurrentMs(Math.round(event.currentTarget.currentTime * 1000))}
    />
  );

  return (
    <section className="listening-builder">
      <header className="listening-builder-header">
        <div><span>Ultimate B2 · Activity Builder</span><h1>Listening · Reading Exercise 2</h1><code>{activityId}</code></div>
        <div className="builder-save-state" role="status" data-dirty={dirty || undefined}>
          <strong>{status}</strong>{error && <small>{error}</small>}
          <button type="button" disabled={!dirty || status === "Saving"} onClick={save}><Save size={17} /> Save</button>
        </div>
      </header>
      <nav className="listening-builder-sections" aria-label="Listening editor sections">
        {sectionNames.map((name) => <button type="button" key={name} aria-selected={section === name} onClick={() => setSection(name)}>{name}</button>)}
      </nav>

      {section === "Overview" && (
        <div className="listening-builder-overview">
          <h2>Recovered source bindings</h2>
          <dl>
            <div><dt>Activity</dt><dd>Reading · Exercise 2</dd></div>
            <div><dt>Instruction image</dt><dd>{authoring.assets.instructionImage}</dd></div>
            <div><dt>Static Show Text image</dt><dd>{authoring.assets.staticTextImage}</dd></div>
            <div><dt>Karaoke background plate</dt><dd>{authoring.assets.karaokeBackgroundImage}</dd></div>
            <div><dt>Full audio</dt><dd>{authoring.assets.fullAudio}</dd></div>
            {authoring.questionSegments.map((segment) => <div key={segment.id}><dt>Question segment {segment.questionNumber}</dt><dd>{segment.audioLogicalKey}</dd></div>)}
          </dl>
          <p>{authoring.karaoke.fragments.length} fragments · {authoring.karaoke.cues.length} timed cue groups · source hashes retained in the manifest.</p>
        </div>
      )}

      {section === "Question Segments" && (
        <div className="listening-builder-segments">
          <aside>
            {authoring.questionSegments.map((segment, index) => (
              <article key={segment.id} className={segmentIndex === index ? "selected" : ""}>
                <button type="button" onClick={() => { setSegmentIndex(index); setSelectedRegionId(null); }}><strong>Question {segment.questionNumber}</strong><span>{segment.questionText}</span><small>{segment.regions.length} highlight regions</small></button>
                <button type="button" onClick={() => { setSegmentIndex(index); setSelectedRegionId(null); setPreviewSegment(index); }}><Play size={15} /> Play/Test</button>
              </article>
            ))}
          </aside>
          <div className="listening-builder-region-workspace">
            <header><div><h2>Question {selectedSegment.questionNumber} regions</h2><p>{selectedSegment.questionText}</p></div><button type="button" disabled={!selectedRegionId} onClick={() => {
              change((next) => { next.questionSegments[segmentIndex].regions = next.questionSegments[segmentIndex].regions.filter((region) => region.id !== selectedRegionId); });
              setSelectedRegionId(null);
            }}><Trash2 size={16} /> Delete region</button></header>
            <SegmentRegionEditor
              authoring={authoring}
              segmentIndex={segmentIndex}
              previewing={previewSegment === segmentIndex}
              selectedRegionId={selectedRegionId}
              onSelectRegion={setSelectedRegionId}
              onChangeRegions={(regions) => change((next) => { next.questionSegments[segmentIndex].regions = regions; })}
            />
          </div>
          <audio ref={segmentAudioRef} src={segmentSource || undefined} onEnded={() => setPreviewSegment(null)} onError={() => { setPreviewSegment(null); setError("Segment preview could not be played."); }} />
        </div>
      )}

      {section === "Karaoke Timeline" && (
        <div className="listening-builder-timeline">
          <div className="listening-builder-transport">{player}<output>Playhead {formatListeningTime(currentMs)}</output></div>
          <div className="listening-builder-cue-list">
            {authoring.karaoke.cues.map((cue, index) => (
              <button type="button" key={cue.id} className={selectedCue.id === cue.id ? "selected" : ""} onClick={() => setSelectedCueId(cue.id)}>
                <strong>Cue {index + 1}</strong><time>{formatListeningTime(cue.startMs)} → {formatListeningTime(cue.endMs)}</time><span>“{cueText(authoring, cue).slice(0, 96)}{cueText(authoring, cue).length > 96 ? "…" : ""}”</span><small>{cue.fragmentIds.length} fragment{cue.fragmentIds.length === 1 ? "" : "s"}</small>
              </button>
            ))}
          </div>
          <aside className="listening-builder-cue-editor">
            <h2>Cue {selectedCueIndex + 1}</h2>
            <p>{cueText(authoring, selectedCue)}</p>
            {[["startMs", "Start time"], ["endMs", "End time"]].map(([field, label]) => (
              <label key={field}>{label}<input value={formatListeningTime(selectedCue[field])} onChange={(event) => {
                const parsed = parseTime(event.target.value);
                if (Number.isFinite(parsed)) updateCueTime(field, parsed);
              }} /></label>
            ))}
            <div className="listening-builder-cue-actions">
              <button type="button" onClick={() => updateCueTime("startMs", currentMs)}>Set start to playhead</button>
              <button type="button" onClick={() => updateCueTime("endMs", currentMs)}>Set end to playhead</button>
              <button type="button" onClick={() => { fullAudioRef.current.currentTime = selectedCue.startMs / 1000; setCurrentMs(selectedCue.startMs); }}>Seek to start</button>
              <button type="button" onClick={() => { fullAudioRef.current.currentTime = selectedCue.startMs / 1000; fullAudioRef.current.play(); }}>Play cue</button>
            </div>
            <h3>Fragment membership</h3>
            <ul>{selectedCue.fragmentIds.map((id) => <li key={id}><code>{id}</code> {authoring.karaoke.fragments.find((fragment) => fragment.id === id)?.runs.map((run) => run.text).join("")}</li>)}</ul>
          </aside>
        </div>
      )}

      {section === "Preview" && (
        <div className="listening-builder-preview">
          <header><div><h2>Runtime preview</h2><p>Uses the same cue lookup and normalized scroll timeline as Teacher playback.</p></div>{player}</header>
          <KaraokePreview authoring={authoring} currentMs={currentMs} viewportRef={previewViewportRef} />
        </div>
      )}
    </section>
  );
}

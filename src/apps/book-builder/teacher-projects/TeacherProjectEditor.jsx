import { AppWindow, ArrowLeft, CheckCircle2, Download, Play, Save, Upload, Volume2, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ClassroomToolsProvider } from "../../android-teacher-offline/ClassroomToolsContext.jsx";
import TeacherOfflineSettingsDialog from "../../android-teacher-offline/TeacherOfflineSettingsDialog.jsx";
import TeacherShellChrome from "../../android-teacher-offline/TeacherShellChrome.jsx";
import TeacherProjectShell from "../../android-teacher-project/TeacherProjectShell.jsx";
import "../../android-teacher-project/teacherProjectRoot.css";
import { materializeTeacherProjectRuntime } from "../../android-teacher-project/teacherProjectRuntimeContract.js";
import { useTeacherProjectSound } from "../../android-teacher-project/teacherProjectSound.js";
import {
  exportTeacherProject,
  importTeacherProjectAsset,
  requestAndroidDevices,
  requestTeacherProject,
  requestTeacherProjectAsset,
  requestTeacherProjectJob,
  runTeacherProject,
  saveTeacherProject,
} from "../bookBuilderApi.js";
import { StudioError, StudioLoading } from "../components/StudioStates.jsx";
import { containedTeacherStage } from "./previewGeometry.js";
import "./teacherProjectEditor.css";

const VIEWPORTS = Object.freeze([
  { id: "16:9", width: 1280, height: 720 },
  { id: "16:10", width: 1280, height: 800 },
  { id: "ultrawide", width: 2560, height: 1080 },
]);

function draftCompleteness(shell) {
  const missing = [];
  const required = (value, label) => { if (!value) missing.push(label); };
  required(shell.background, "Background");
  required(shell.titleAnimation.gaf, "GAF title animation");
  if (!shell.titleAnimation.sdAtlases.length) missing.push("GAF SD atlas");
  if (!shell.titleAnimation.hdAtlases.length) missing.push("GAF HD atlas");
  for (const [id, label] of [["settings", "Settings"], ["minimize", "Minimize"], ["close", "Close"]]) {
    required(shell.chrome[id].image, `${label} image`);
    required(shell.chrome[id].sound, `${label} sound`);
  }
  for (const item of [...shell.units, ...shell.editions, ...shell.toolbar]) {
    required(item.normal, `${item.label} normal image`);
    required(item.active, `${item.label} active image`);
    required(item.sound, `${item.label} sound`);
  }
  return { complete: missing.length === 0, missing };
}

function useTeacherAssetUrls(project) {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    if (!project) return undefined;
    const controller = new AbortController();
    const created = [];
    Promise.all(Object.keys(project.assets).map(async (assetId) => {
      try {
        const blob = await requestTeacherProjectAsset(project.projectId, assetId, { signal: controller.signal });
        const url = URL.createObjectURL(blob);
        created.push(url);
        return [assetId, url];
      } catch (error) {
        if (error.name !== "AbortError") return [assetId, null];
        return null;
      }
    })).then((entries) => { if (!controller.signal.aborted) setUrls(Object.fromEntries(entries.filter(Boolean))); });
    return () => {
      controller.abort();
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [project?.projectId, project?.revision, project ? Object.keys(project.assets).join("|") : ""]);
  return urls;
}

function AssetSlot({ label, assetId, project, urls, descriptor, accept = "image/png,image/jpeg,image/webp", writeEnabled, onImported, onClear }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const asset = assetId ? project.assets[assetId] : null;
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPending(true); setError("");
    try { onImported(await importTeacherProjectAsset(project.projectId, file, descriptor)); }
    catch (reason) { setError(reason.message); }
    finally { setPending(false); }
  };
  return (
    <div className={`teacher-asset-slot ${asset ? "has-asset" : ""}`}>
      <div className="teacher-asset-slot-preview">{asset && asset.mediaType.startsWith("image/") && urls[assetId] ? <img src={urls[assetId]} alt="" /> : <Upload aria-hidden="true" />}</div>
      <div className="teacher-asset-slot-copy"><strong>{label}</strong>{asset ? <><span>{asset.originalFilename}</span><small>{asset.width ? `${asset.width} × ${asset.height} · ` : ""}{Math.ceil(asset.sizeBytes / 1024)} KB</small></> : <span>Missing</span>}{error && <small className="studio-validation-errors" role="alert">{error}</small>}</div>
      <div className="teacher-asset-slot-actions">
        <label className="studio-button secondary"><input type="file" accept={accept} disabled={!writeEnabled || pending} onChange={upload} /><span>{pending ? "Importing…" : asset ? "Replace" : "Choose file"}</span></label>
        {asset && <button type="button" className="studio-icon-button" disabled={!writeEnabled} aria-label={`Remove ${label} assignment`} onClick={onClear}><XCircle aria-hidden="true" /></button>}
      </div>
    </div>
  );
}

function SoundSelect({ label, value, audioAssets, urls, disabled, onChange }) {
  const testSound = () => {
    const source = urls[value];
    if (!source) return;
    const player = new Audio(source);
    player.play().catch(() => {});
  };
  return (
    <label className="teacher-sound-select"><span>{label}</span><select value={value || ""} disabled={disabled} onChange={(event) => onChange(event.target.value || null)}><option value="">No sound assigned</option>{audioAssets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.originalFilename}</option>)}</select><button type="button" className="studio-icon-button" disabled={!value || !urls[value]} aria-label={`Test ${label} sound`} onClick={testSound}><Volume2 aria-hidden="true" /></button></label>
  );
}

function PreviewCanvas({ config, viewport }) {
  const hostRef = useRef(null);
  const [layout, setLayout] = useState({ width: 800, height: 450, scale: 800 / 1920, left: 0, top: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [simulation, setSimulation] = useState("");
  useTeacherProjectSound(config.soundMap);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const update = () => {
      const width = host.clientWidth || 1;
      const height = width * viewport.height / viewport.width;
      setLayout(containedTeacherStage({ width, height }));
    };
    const observer = new ResizeObserver(update);
    observer.observe(host); update();
    return () => observer.disconnect();
  }, [viewport]);
  return (
    <div ref={hostRef} className="teacher-project-preview-host" data-preview-viewport={viewport.id} style={{ height: layout.height, backgroundImage: config.background ? `url(${config.background})` : undefined }}>
      <div className="teacher-project-preview-stage" data-teacher-stage="" data-teacher-stage-scale={layout.scale.toFixed(6)} style={{ left: layout.left, top: layout.top, transform: `scale(${layout.scale})` }}>
        <ClassroomToolsProvider>
          <div className="teacher-offline-settings-surface" data-teacher-theme="legacy" data-teacher-motion="on" style={{ "--teacher-ui-scale": 1 }}>
            <TeacherProjectShell config={config} animationsActive editing />
            <TeacherShellChrome menuSkin={{ settingsIcon: config.chrome.settings.image, minimizeIcon: config.chrome.minimize.image, closeIcon: config.chrome.close.image }} soundControlIds={{ settings: config.chrome.settings.controlId, minimize: config.chrome.minimize.controlId, close: config.chrome.close.controlId }} onOpenSettings={() => setSettingsOpen(true)} onMinimize={() => setSimulation("Minimize simulated in preview")} onClose={() => setSimulation("Close simulated in preview")} />
            <TeacherOfflineSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
            {simulation && <div className="teacher-project-preview-notice" role="status">{simulation}</div>}
          </div>
        </ClassroomToolsProvider>
      </div>
    </div>
  );
}

function VisualRows({ section, items, project, urls, writeEnabled, audioAssets, updateItem, imported }) {
  return <div className="teacher-project-slot-list">{items.map((item, index) => <article className="teacher-project-control-row" key={item.id}><h3>{item.label}</h3><div className="teacher-project-paired-assets">{["normal", "active"].map((variant) => <AssetSlot key={variant} label={variant === "normal" ? "Normal image" : "Active image"} assetId={item[variant]} project={project} urls={urls} descriptor={{ section, slot: item.id, variant, index: null }} writeEnabled={writeEnabled} onImported={(result) => imported(result, (shell) => { shell[section][index][variant] = result.asset.assetId; })} onClear={() => updateItem(index, variant, null)} />)}</div><SoundSelect label="Click" value={item.sound} audioAssets={audioAssets} urls={urls} disabled={!writeEnabled} onChange={(value) => updateItem(index, "sound", value)} /></article>)}</div>;
}

export function TeacherProjectEditor({ projectId, writeEnabled }) {
  const [state, setState] = useState({ status: "loading", project: null, draftName: "", draftShell: null, error: null });
  const [saveState, setSaveState] = useState({ pending: false, message: "" });
  const [buildState, setBuildState] = useState({ job: null, error: "", devices: [], selectedSerial: "" });
  const [viewport, setViewport] = useState(VIEWPORTS[0]);
  const load = useCallback(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, status: "loading", error: null }));
    requestTeacherProject(projectId, { signal: controller.signal }).then(({ project }) => setState({ status: "ready", project, draftName: project.displayName, draftShell: structuredClone(project.shell), error: null })).catch((error) => { if (error.name !== "AbortError") setState({ status: "error", project: null, draftName: "", draftShell: null, error }); });
    return () => controller.abort();
  }, [projectId]);
  useEffect(() => load(), [load]);
  useEffect(() => {
    if (!buildState.job || !["queued", "running"].includes(buildState.job.status)) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => requestTeacherProjectJob(buildState.job.jobId, { signal: controller.signal })
      .then(({ job }) => setBuildState((current) => ({ ...current, job, error: job.error?.message || "" })))
      .catch((error) => { if (error.name !== "AbortError") setBuildState((current) => ({ ...current, error: error.message })); }), 700);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [buildState.job]);
  const urls = useTeacherAssetUrls(state.project);
  const audioAssets = useMemo(() => state.project ? Object.values(state.project.assets).filter((asset) => asset.mediaType.startsWith("audio/")).sort((a, b) => a.originalFilename.localeCompare(b.originalFilename)) : [], [state.project]);
  const runtime = useMemo(() => state.project && state.draftShell ? materializeTeacherProjectRuntime({ ...state.project, displayName: state.draftName, shell: state.draftShell }, (assetId) => urls[assetId] || null) : null, [state.project, state.draftName, state.draftShell, urls]);
  if (state.status === "loading") return <main id="main-content"><StudioLoading label="Loading Teacher APK Project…" /></main>;
  if (state.status === "error") return <main id="main-content"><StudioError error={state.error} onRetry={load} title="Teacher APK Project could not open" /></main>;
  const { project, draftShell } = state;
  const updateShell = (mutation) => setState((current) => { const next = structuredClone(current.draftShell); mutation(next); return { ...current, draftShell: next }; });
  const imported = (result, assign) => setState((current) => {
    const next = structuredClone(current.draftShell);
    assign(next);
    return { ...current, project: result.project, draftShell: next };
  });
  const dirty = state.draftName !== project.displayName || JSON.stringify(draftShell) !== JSON.stringify(project.shell);
  const completeness = draftCompleteness(draftShell);
  const save = async () => {
    setSaveState({ pending: true, message: "" });
    try {
      const result = await saveTeacherProject(project.projectId, { displayName: state.draftName, expectedRevision: project.revision, shell: draftShell });
      setState((current) => ({ ...current, project: result.project, draftName: result.project.displayName, draftShell: structuredClone(result.project.shell) }));
      setSaveState({ pending: false, message: `Saved revision ${result.project.revision}` });
    } catch (error) { setSaveState({ pending: false, message: error.message }); }
  };
  const updateArrayItem = (section, index, key, value) => updateShell((shell) => { shell[section][index][key] = value; });
  const startExport = async () => {
    setBuildState({ job: null, error: "", devices: [], selectedSerial: "" });
    try { const { job } = await exportTeacherProject(project.projectId, project.revision); setBuildState((current) => ({ ...current, job })); }
    catch (error) { setBuildState((current) => ({ ...current, error: error.message })); }
  };
  const startRun = async (serial) => {
    try { const { job } = await runTeacherProject(project.projectId, project.revision, serial); setBuildState((current) => ({ ...current, job, error: "", devices: [] })); }
    catch (error) { setBuildState((current) => ({ ...current, error: error.message })); }
  };
  const chooseRunTarget = async () => {
    setBuildState({ job: null, error: "", devices: [], selectedSerial: "" });
    try {
      const result = await requestAndroidDevices();
      const ready = result.devices.filter((device) => device.state === "device");
      if (!result.available) throw new Error("ADB is unavailable. Configure Android SDK platform-tools and try again.");
      if (!ready.length) throw new Error("No Android emulator/device is available. Start an emulator and try again.");
      if (ready.length === 1) await startRun(ready[0].serial);
      else setBuildState((current) => ({ ...current, devices: ready, selectedSerial: "" }));
    } catch (error) { setBuildState((current) => ({ ...current, error: error.message })); }
  };
  const buildBusy = ["queued", "running"].includes(buildState.job?.status);
  const chromeLabels = { settings: "Settings", minimize: "Minimize", close: "Close" };
  return (
    <main className="teacher-project-editor" id="main-content">
      <header className="teacher-project-editor-header"><div><a href="#/" className="studio-back-link"><ArrowLeft aria-hidden="true" />All projects</a><span className="studio-eyebrow">Teacher APK Project · {project.projectId}</span><input aria-label="Project display name" value={state.draftName} disabled={!writeEnabled} onChange={(event) => setState((current) => ({ ...current, draftName: event.target.value }))} /><p>Revision {project.revision} · {dirty ? "Unsaved draft changes" : "Saved"}</p></div><div className="teacher-project-editor-actions"><button className="studio-button primary" type="button" disabled={!writeEnabled || saveState.pending || !dirty} onClick={save}><Save aria-hidden="true" />{saveState.pending ? "Saving…" : "Save"}</button><button className="studio-button secondary" type="button" disabled={!writeEnabled || dirty || !completeness.complete || buildBusy} onClick={startExport} title={dirty ? "Save before export" : !completeness.complete ? "Complete all required shell assets" : "Export debug APK"}><Download aria-hidden="true" />Export APK</button><button className="studio-button secondary" type="button" disabled={!writeEnabled || dirty || !completeness.complete || buildBusy} onClick={chooseRunTarget}><Play aria-hidden="true" />Run</button></div></header>
      {saveState.message && <p className="teacher-project-save-status" role="status">{saveState.message}</p>}
      <div className="teacher-project-editor-layout"><section className="teacher-project-config" aria-label="Teacher project configuration">
        <div className={`teacher-project-completeness ${completeness.complete ? "complete" : "incomplete"}`}>{completeness.complete ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />}<div><strong>{completeness.complete ? "Shell assets complete" : `${completeness.missing.length} required assignments missing`}</strong><span>{completeness.complete ? "Save to enable Export APK and Run." : completeness.missing.slice(0, 4).join(" · ")}</span></div></div>
        <details open><summary>Project</summary><div className="teacher-project-section"><label><span>Display name</span><input value={state.draftName} disabled={!writeEnabled} onChange={(event) => setState((current) => ({ ...current, draftName: event.target.value }))} /></label><label><span>Project slug / ID</span><input value={project.projectId} disabled /></label><p>Android compatibility application ID is fixed. Run replaces the currently installed Teacher debug app on the selected device.</p></div></details>
        <details open><summary>Background &amp; title animation</summary><div className="teacher-project-section"><AssetSlot label="Main background" assetId={draftShell.background} project={project} urls={urls} descriptor={{ section: "background", slot: "main", variant: "image", index: null }} writeEnabled={writeEnabled} onImported={(result) => imported(result, (shell) => { shell.background = result.asset.assetId; })} onClear={() => updateShell((shell) => { shell.background = null; })} /><AssetSlot label="GAF title file" assetId={draftShell.titleAnimation.gaf} project={project} urls={urls} descriptor={{ section: "animation", slot: "title", variant: "gaf", index: null }} accept=".gaf,application/octet-stream" writeEnabled={writeEnabled} onImported={(result) => imported(result, (shell) => { shell.titleAnimation.gaf = result.asset.assetId; })} onClear={() => updateShell((shell) => { shell.titleAnimation.gaf = null; })} />{["sdAtlases", "hdAtlases"].map((key) => { const variant = key === "sdAtlases" ? "sd" : "hd"; const entries = [...draftShell.titleAnimation[key], null].slice(0, 8); return <div key={key}><h3>{variant.toUpperCase()} atlases</h3>{entries.map((assetId, index) => <AssetSlot key={`${variant}-${index}`} label={`${variant.toUpperCase()} atlas ${index + 1}`} assetId={assetId} project={project} urls={urls} descriptor={{ section: "animation", slot: "title", variant, index }} accept="image/png" writeEnabled={writeEnabled} onImported={(result) => imported(result, (shell) => { shell.titleAnimation[key][index] = result.asset.assetId; })} onClear={() => updateShell((shell) => { shell.titleAnimation[key].splice(index, 1); })} />)}</div>; })}</div></details>
        <details><summary>Window controls</summary><div className="teacher-project-section">{Object.entries(chromeLabels).map(([id, label]) => <article className="teacher-project-control-row" key={id}><h3>{label}</h3><AssetSlot label={`${label} image`} assetId={draftShell.chrome[id].image} project={project} urls={urls} descriptor={{ section: "chrome", slot: id, variant: "image", index: null }} writeEnabled={writeEnabled} onImported={(result) => imported(result, (shell) => { shell.chrome[id].image = result.asset.assetId; })} onClear={() => updateShell((shell) => { shell.chrome[id].image = null; })} /><SoundSelect label="Click" value={draftShell.chrome[id].sound} audioAssets={audioAssets} urls={urls} disabled={!writeEnabled} onChange={(value) => updateShell((shell) => { shell.chrome[id].sound = value; })} /></article>)}</div></details>
        <details><summary>Units 1–10</summary><div className="teacher-project-section"><VisualRows section="units" items={draftShell.units} project={project} urls={urls} writeEnabled={writeEnabled} audioAssets={audioAssets} imported={imported} updateItem={(index, key, value) => updateArrayItem("units", index, key, value)} /></div></details>
        <details><summary>Book editions</summary><div className="teacher-project-section"><VisualRows section="editions" items={draftShell.editions} project={project} urls={urls} writeEnabled={writeEnabled} audioAssets={audioAssets} imported={imported} updateItem={(index, key, value) => updateArrayItem("editions", index, key, value)} /></div></details>
        <details><summary>Teacher toolbar · {draftShell.toolbar.length} slots</summary><div className="teacher-project-section"><VisualRows section="toolbar" items={draftShell.toolbar} project={project} urls={urls} writeEnabled={writeEnabled} audioAssets={audioAssets} imported={imported} updateItem={(index, key, value) => updateArrayItem("toolbar", index, key, value)} /></div></details>
        <details><summary>Sounds / asset library</summary><div className="teacher-project-section"><AssetSlot label="Import MP3 or WAV" assetId={null} project={project} urls={urls} descriptor={{ section: "audio", slot: "library", variant: "sound", index: null }} accept="audio/mpeg,audio/wav,.mp3,.wav" writeEnabled={writeEnabled} onImported={(result) => setState((current) => ({ ...current, project: result.project }))} onClear={() => {}} /><ul className="teacher-audio-library">{audioAssets.map((asset) => <li key={asset.assetId}><Volume2 aria-hidden="true" /><span><strong>{asset.originalFilename}</strong><small>{Math.ceil(asset.sizeBytes / 1024)} KB · {asset.sha256.slice(0, 12)}</small></span><button type="button" className="studio-button secondary" onClick={() => { const player = new Audio(urls[asset.assetId]); player.play().catch(() => {}); }}>Test sound</button></li>)}</ul></div></details>
        <details open={Boolean(buildState.job || buildState.error || buildState.devices.length)}><summary>Build &amp; Run</summary><div className="teacher-project-section"><p>Export validates the saved revision, builds the isolated generic Teacher runtime, syncs Capacitor, assembles and verifies a debug APK. Run installs it with <code>adb install -r</code> and launches the fixed Teacher application ID.</p>{buildState.job && <div className={`teacher-build-job ${buildState.job.status}`} role="status"><strong>{buildState.job.stage}</strong><span>{buildState.job.status === "complete" ? buildState.job.result?.apkFilename : `Job ${buildState.job.jobId.slice(0, 8)} · ${buildState.job.status}`}</span></div>}{buildState.error && <p className="studio-validation-errors" role="alert">{buildState.error}</p>}{buildState.devices.length > 1 && <div className="teacher-device-picker"><label><span>Android target</span><select value={buildState.selectedSerial} onChange={(event) => setBuildState((current) => ({ ...current, selectedSerial: event.target.value }))}><option value="">Select an emulator/device</option>{buildState.devices.map((device) => <option value={device.serial} key={device.serial}>{device.model || device.device || "Android device"} · {device.serial}</option>)}</select></label><button type="button" className="studio-button primary" disabled={!buildState.selectedSerial} onClick={() => startRun(buildState.selectedSerial)}>Install and launch</button></div>}</div></details>
      </section><aside className="teacher-project-preview-panel"><div className="teacher-project-preview-heading"><div><AppWindow aria-hidden="true" /><span><strong>Live Teacher shell preview</strong><small>Shared runtime · 1920 × 1080 logical stage</small></span></div><div role="group" aria-label="Preview viewport">{VIEWPORTS.map((item) => <button key={item.id} type="button" aria-pressed={viewport.id === item.id} onClick={() => setViewport(item)}>{item.id}</button>)}</div></div>{runtime && <PreviewCanvas config={runtime} viewport={viewport} />}</aside></div>
    </main>
  );
}

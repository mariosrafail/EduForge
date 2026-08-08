import { AppWindow, ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Download, Expand, Import, Play, Save, Volume2, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ClassroomToolsProvider } from "../../android-teacher-offline/ClassroomToolsContext.jsx";
import TeacherOfflineSettingsDialog from "../../android-teacher-offline/TeacherOfflineSettingsDialog.jsx";
import TeacherShellChrome from "../../android-teacher-offline/TeacherShellChrome.jsx";
import TeacherProjectShell from "../../android-teacher-project/TeacherProjectShell.jsx";
import "../../android-teacher-project/teacherProjectRoot.css";
import { materializeTeacherProjectRuntime } from "../../android-teacher-project/teacherProjectRuntimeContract.js";
import { useTeacherProjectSound } from "../../android-teacher-project/teacherProjectSound.js";
import {
  exportTeacherProject, removeTeacherProjectAsset, requestAndroidDevices, requestTeacherProject,
  requestTeacherProjectAsset, requestTeacherProjectJob, runTeacherProject, saveTeacherProject,
} from "../bookBuilderApi.js";
import { StudioError, StudioLoading } from "../components/StudioStates.jsx";
import { containedTeacherStage } from "./previewGeometry.js";
import TeacherProjectBulkImport from "./TeacherProjectBulkImport.jsx";
import { TeacherProjectAssetSlot, friendlyTeacherError } from "./TeacherProjectAssetSlot.jsx";
import TeacherProjectQaPanel from "./TeacherProjectQaPanel.jsx";
import { assignSoundGroup, teacherAssetUsage, teacherShellProgress, TEACHER_PROJECT_SECTIONS } from "./teacherProjectAuthoring.js";
import "./teacherProjectEditor.css";

const VIEWPORTS = Object.freeze([
  { id: "16:9", width: 1280, height: 720 }, { id: "16:10", width: 1280, height: 800 }, { id: "ultrawide", width: 2560, height: 1080 },
]);

function useTeacherAssetUrls(project) {
  const [urls, setUrls] = useState({});
  const assetSignature = project ? Object.values(project.assets).map((asset) => `${asset.assetId}:${asset.sha256}`).sort().join("|") : "";
  useEffect(() => {
    if (!project) return undefined;
    const controller = new AbortController();
    const created = [];
    Promise.all(Object.keys(project.assets).map(async (assetId) => {
      try {
        const blob = await requestTeacherProjectAsset(project.projectId, assetId, { signal: controller.signal });
        const url = URL.createObjectURL(blob); created.push(url); return [assetId, url];
      } catch (error) { return error.name === "AbortError" ? null : [assetId, null]; }
    })).then((entries) => { if (!controller.signal.aborted) setUrls(Object.fromEntries(entries.filter(Boolean))); });
    return () => { controller.abort(); created.forEach((url) => URL.revokeObjectURL(url)); };
  }, [project?.projectId, assetSignature]);
  return urls;
}

function SoundSelect({ label = "Sound", value, audioAssets, urls, disabled, onChange }) {
  const test = () => { if (urls[value]) new Audio(urls[value]).play().catch(() => {}); };
  return <label className="teacher-sound-select"><span>{label}</span><select value={value || ""} disabled={disabled} onChange={(event) => onChange(event.target.value || null)}><option value="">No sound assigned</option>{audioAssets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.originalFilename}</option>)}</select><button type="button" className="studio-icon-button" disabled={!value || !urls[value]} aria-label={`Test ${label}`} onClick={test}><Volume2 aria-hidden="true" /></button></label>;
}

function PreviewCanvas({ config, viewport, qaFocus }) {
  const hostRef = useRef(null);
  const [layout, setLayout] = useState({ width: 800, height: 450, scale: 800 / 1920, left: 0, top: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [simulation, setSimulation] = useState("");
  useTeacherProjectSound(config.soundMap);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const update = () => { const width = host.clientWidth || 1; setLayout(containedTeacherStage({ width, height: width * viewport.height / viewport.width })); };
    const observer = new ResizeObserver(update); observer.observe(host); update(); return () => observer.disconnect();
  }, [viewport]);
  useEffect(() => {
    const stage = hostRef.current?.querySelector("[data-teacher-stage]");
    const previous = stage?.querySelector(".teacher-project-qa-focus");
    previous?.classList.remove("teacher-project-qa-focus");
    if (!qaFocus || !stage) return;
    const control = [...stage.querySelectorAll("[data-teacher-control-id]")].find((item) => item.getAttribute("data-teacher-control-id")?.endsWith(qaFocus));
    control?.classList.add("teacher-project-qa-focus");
  }, [qaFocus, config]);
  return <div ref={hostRef} className="teacher-project-preview-host" data-preview-viewport={viewport.id} style={{ height: layout.height, backgroundImage: config.background ? `url(${config.background})` : undefined }}><div className="teacher-project-preview-stage" data-teacher-stage="" data-teacher-stage-scale={layout.scale.toFixed(6)} style={{ left: layout.left, top: layout.top, transform: `scale(${layout.scale})` }}><ClassroomToolsProvider><div className="teacher-offline-settings-surface" data-teacher-theme="legacy" data-teacher-motion="on" style={{ "--teacher-ui-scale": 1 }}><TeacherProjectShell config={config} animationsActive editing /><TeacherShellChrome menuSkin={{ settingsIcon: config.chrome.settings.image, minimizeIcon: config.chrome.minimize.image, closeIcon: config.chrome.close.image }} soundControlIds={{ settings: config.chrome.settings.controlId, minimize: config.chrome.minimize.controlId, close: config.chrome.close.controlId }} onOpenSettings={() => setSettingsOpen(true)} onMinimize={() => setSimulation("Minimize simulated in preview")} onClose={() => setSimulation("Close simulated in preview")} /><TeacherOfflineSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />{simulation && <div className="teacher-project-preview-notice" role="status">{simulation}</div>}</div></ClassroomToolsProvider></div></div>;
}

function VisualRows({ section, items, project, urls, writeEnabled, audioAssets, updateItem, imported }) {
  return <div className={`teacher-project-slot-list ${section !== "editions" ? "dense" : ""}`}>{items.map((item, index) => {
    const complete = Boolean(item.normal && item.active && item.sound);
    return <article className="teacher-project-control-row" key={item.id}><header><h3>{item.label}</h3><span className={complete ? "complete" : "missing"}>{complete ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />}{complete ? "Complete" : [item.normal, item.active, item.sound].filter((value) => !value).length + " missing"}</span></header><div className="teacher-project-paired-assets">{["normal", "active"].map((variant) => <TeacherProjectAssetSlot key={variant} label={variant === "normal" ? "Normal" : "Active"} assetId={item[variant]} project={project} urls={urls} descriptor={{ section, slot: item.id, variant, index: null }} writeEnabled={writeEnabled} onImported={(result) => imported(result, (shell) => { shell[section][index][variant] = result.asset.assetId; })} onClear={() => updateItem(index, variant, null)} />)}</div><SoundSelect value={item.sound} audioAssets={audioAssets} urls={urls} disabled={!writeEnabled} onChange={(value) => updateItem(index, "sound", value)} /></article>;
  })}</div>;
}

function Overview({ project, progress, dirty, buildState, onImport }) {
  const sections = [["shell", "Shell & Animation"], ["chrome", "Window Controls"], ["units", "Units"], ["editions", "Book Editions"], ["toolbar", "Teacher Toolbar"]];
  return <div className="teacher-overview"><div className="teacher-overview-metrics"><article><strong>{progress.configuredCount} / {progress.requiredCount}</strong><span>Configured assignments</span></article><article><strong>{progress.missingCount}</strong><span>Missing assignments</span></article><article><strong>{Object.keys(project.assets).length}</strong><span>Imported assets</span></article><article><strong>{(Object.values(project.assets).reduce((sum, asset) => sum + asset.sizeBytes, 0) / 1048576).toFixed(1)} MB</strong><span>Total asset size</span></article></div><div className="teacher-overview-sections">{sections.map(([id, label]) => <div key={id}><span>{label}</span><strong>{progress.sections[id].configured} / {progress.sections[id].required}</strong><progress value={progress.sections[id].configured} max={progress.sections[id].required} /></div>)}</div><div className="teacher-overview-status"><strong>Revision {project.revision} · {dirty ? "Unsaved changes" : "Saved"}</strong><span>{buildState.job ? `Latest build: ${buildState.job.stage} (${buildState.job.status})` : "No build started in this session."}</span></div>{progress.configuredCount === 0 && <div className="teacher-empty-guide"><h3>Your shell is empty</h3><p>Fastest start: import a prepared folder, review mappings, assign sounds, save, then export.</p><button type="button" className="studio-button primary" onClick={onImport}><Import aria-hidden="true" />Import Assets</button></div>}</div>;
}

export function TeacherProjectEditor({ projectId, writeEnabled }) {
  const [state, setState] = useState({ status: "loading", project: null, draftName: "", draftShell: null, error: null });
  const [saveState, setSaveState] = useState({ pending: false, message: "" });
  const [buildState, setBuildState] = useState({ job: null, error: "", devices: [], selectedSerial: "" });
  const [section, setSection] = useState("overview");
  const [viewport, setViewport] = useState(VIEWPORTS[0]);
  const [importOpen, setImportOpen] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [qaFocus, setQaFocus] = useState("");
  const [groupSound, setGroupSound] = useState({ assetId: "", section: "units", onlyEmpty: true });
  const load = useCallback(() => {
    const controller = new AbortController(); setState((current) => ({ ...current, status: "loading", error: null }));
    requestTeacherProject(projectId, { signal: controller.signal }).then(({ project }) => setState({ status: "ready", project, draftName: project.displayName, draftShell: structuredClone(project.shell), error: null })).catch((error) => { if (error.name !== "AbortError") setState({ status: "error", project: null, draftName: "", draftShell: null, error }); });
    return () => controller.abort();
  }, [projectId]);
  useEffect(() => load(), [load]);
  useEffect(() => {
    if (!buildState.job || !["queued", "running"].includes(buildState.job.status)) return undefined;
    const controller = new AbortController(); const timer = window.setTimeout(() => requestTeacherProjectJob(buildState.job.jobId, { signal: controller.signal }).then(({ job }) => setBuildState((current) => ({ ...current, job, error: job.error?.message || "" }))).catch((error) => { if (error.name !== "AbortError") setBuildState((current) => ({ ...current, error: friendlyTeacherError(error) })); }), 700);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [buildState.job]);
  const urls = useTeacherAssetUrls(state.project);
  const audioAssets = useMemo(() => state.project ? Object.values(state.project.assets).filter((asset) => asset.mediaType.startsWith("audio/")).sort((a, b) => a.originalFilename.localeCompare(b.originalFilename)) : [], [state.project]);
  const runtime = useMemo(() => state.project && state.draftShell ? materializeTeacherProjectRuntime({ ...state.project, displayName: state.draftName, shell: state.draftShell }, (assetId) => urls[assetId] || null) : null, [state.project, state.draftName, state.draftShell, urls]);
  if (state.status === "loading") return <main id="main-content"><StudioLoading label="Loading Teacher APK Project…" /></main>;
  if (state.status === "error") return <main id="main-content"><StudioError error={state.error} onRetry={load} title="Teacher APK Project could not open" /></main>;
  const { project, draftShell } = state;
  const updateShell = (mutation) => setState((current) => { const next = structuredClone(current.draftShell); mutation(next); return { ...current, draftShell: next }; });
  const imported = (result, assign) => setState((current) => { const next = structuredClone(current.draftShell); assign(next); return { ...current, project: result.project, draftShell: next }; });
  const dirty = state.draftName !== project.displayName || JSON.stringify(draftShell) !== JSON.stringify(project.shell);
  const progress = teacherShellProgress(draftShell);
  const usage = teacherAssetUsage(draftShell);
  const save = async () => {
    setSaveState({ pending: true, message: "" });
    try { const result = await saveTeacherProject(project.projectId, { displayName: state.draftName, expectedRevision: project.revision, shell: draftShell }); setState((current) => ({ ...current, project: result.project, draftName: result.project.displayName, draftShell: structuredClone(result.project.shell) })); setSaveState({ pending: false, message: `Saved revision ${result.project.revision}` }); }
    catch (error) { setSaveState({ pending: false, message: friendlyTeacherError(error) }); }
  };
  const updateArrayItem = (name, index, key, value) => updateShell((shell) => { shell[name][index][key] = value; });
  const startExport = async () => { setBuildState({ job: null, error: "", devices: [], selectedSerial: "" }); try { const { job } = await exportTeacherProject(project.projectId, project.revision); setBuildState((current) => ({ ...current, job })); } catch (error) { setBuildState((current) => ({ ...current, error: friendlyTeacherError(error) })); } };
  const startRun = async (serial) => { try { const { job } = await runTeacherProject(project.projectId, project.revision, serial); setBuildState((current) => ({ ...current, job, error: "", devices: [] })); } catch (error) { setBuildState((current) => ({ ...current, error: friendlyTeacherError(error) })); } };
  const chooseRunTarget = async () => { setBuildState({ job: null, error: "", devices: [], selectedSerial: "" }); try { const result = await requestAndroidDevices(); const ready = result.devices.filter((device) => device.state === "device"); if (!result.available) throw new Error("ADB is unavailable. Configure Android SDK platform-tools and try again."); if (!ready.length) throw new Error("No Android emulator/device is available. Start an emulator and try again."); if (ready.length === 1) await startRun(ready[0].serial); else setBuildState((current) => ({ ...current, devices: ready })); } catch (error) { setBuildState((current) => ({ ...current, error: friendlyTeacherError(error) })); } };
  const removeUnused = async (asset) => {
    if (usage.has(asset.assetId) || !window.confirm(`Remove unused asset “${asset.originalFilename}”?`)) return;
    try { const result = await removeTeacherProjectAsset(project.projectId, asset.assetId, project.revision); setState((current) => ({ ...current, project: result.project })); }
    catch (error) { setSaveState({ pending: false, message: friendlyTeacherError(error) }); }
  };
  const moveAtlas = (key, index, direction) => updateShell((shell) => { const destination = index + direction; if (destination < 0 || destination >= shell.titleAnimation[key].length) return; [shell.titleAnimation[key][index], shell.titleAnimation[key][destination]] = [shell.titleAnimation[key][destination], shell.titleAnimation[key][index]]; });
  const buildBusy = ["queued", "running"].includes(buildState.job?.status);
  const chromeLabels = { settings: "Settings", minimize: "Minimize", close: "Close" };
  const renderSection = () => {
    if (section === "overview") return <Overview project={project} progress={progress} dirty={dirty} buildState={buildState} onImport={() => setImportOpen(true)} />;
    if (section === "shell") return <div className="teacher-project-section"><TeacherProjectAssetSlot label="Main background" assetId={draftShell.background} project={project} urls={urls} descriptor={{ section: "background", slot: "main", variant: "image", index: null }} writeEnabled={writeEnabled} onImported={(result) => imported(result, (shell) => { shell.background = result.asset.assetId; })} onClear={() => updateShell((shell) => { shell.background = null; })} /><TeacherProjectAssetSlot label="GAF title file" assetId={draftShell.titleAnimation.gaf} project={project} urls={urls} descriptor={{ section: "animation", slot: "title", variant: "gaf", index: null }} accept=".gaf,application/octet-stream" writeEnabled={writeEnabled} onImported={(result) => imported(result, (shell) => { shell.titleAnimation.gaf = result.asset.assetId; })} onClear={() => updateShell((shell) => { shell.titleAnimation.gaf = null; })} />{["sdAtlases", "hdAtlases"].map((key) => { const variant = key === "sdAtlases" ? "sd" : "hd"; const entries = [...draftShell.titleAnimation[key], null].slice(0, 8); return <div className="teacher-atlas-list" key={key}><h3>{variant.toUpperCase()} atlases</h3>{entries.map((assetId, index) => <div className="teacher-atlas-row" key={`${variant}-${index}`}><TeacherProjectAssetSlot label={`${variant.toUpperCase()} atlas ${index + 1}`} assetId={assetId} project={project} urls={urls} descriptor={{ section: "animation", slot: "title", variant, index }} accept="image/png" writeEnabled={writeEnabled} onImported={(result) => imported(result, (shell) => { shell.titleAnimation[key][index] = result.asset.assetId; })} onClear={() => updateShell((shell) => { shell.titleAnimation[key].splice(index, 1); })} />{assetId && <div className="teacher-atlas-order"><button type="button" className="studio-icon-button" disabled={index === 0} aria-label={`Move ${variant.toUpperCase()} atlas ${index + 1} up`} onClick={() => moveAtlas(key, index, -1)}><ArrowUp /></button><button type="button" className="studio-icon-button" disabled={index === draftShell.titleAnimation[key].length - 1} aria-label={`Move ${variant.toUpperCase()} atlas ${index + 1} down`} onClick={() => moveAtlas(key, index, 1)}><ArrowDown /></button></div>}</div>)}</div>; })}</div>;
    if (section === "chrome") return <div className="teacher-project-section teacher-project-slot-list">{Object.entries(chromeLabels).map(([id, label]) => <article className="teacher-project-control-row" key={id}><header><h3>{label}</h3><span className={draftShell.chrome[id].image && draftShell.chrome[id].sound ? "complete" : "missing"}>{draftShell.chrome[id].image && draftShell.chrome[id].sound ? "Complete" : "Incomplete"}</span></header><TeacherProjectAssetSlot label={`${label} image`} assetId={draftShell.chrome[id].image} project={project} urls={urls} descriptor={{ section: "chrome", slot: id, variant: "image", index: null }} writeEnabled={writeEnabled} onImported={(result) => imported(result, (shell) => { shell.chrome[id].image = result.asset.assetId; })} onClear={() => updateShell((shell) => { shell.chrome[id].image = null; })} /><SoundSelect value={draftShell.chrome[id].sound} audioAssets={audioAssets} urls={urls} disabled={!writeEnabled} onChange={(value) => updateShell((shell) => { shell.chrome[id].sound = value; })} /></article>)}</div>;
    if (["units", "editions", "toolbar"].includes(section)) return <VisualRows section={section} items={draftShell[section]} project={project} urls={urls} writeEnabled={writeEnabled} audioAssets={audioAssets} imported={imported} updateItem={(index, key, value) => updateArrayItem(section, index, key, value)} />;
    if (section === "assets") return <div className="teacher-project-section"><div className="teacher-sound-bulk"><h3>Group sound assignment</h3><SoundSelect label="Reusable sound" value={groupSound.assetId} audioAssets={audioAssets} urls={urls} disabled={!writeEnabled} onChange={(assetId) => setGroupSound((current) => ({ ...current, assetId }))} /><label><span>Apply to</span><select value={groupSound.section} onChange={(event) => setGroupSound((current) => ({ ...current, section: event.target.value }))}><option value="units">All Units</option><option value="editions">All Editions</option><option value="toolbar">All Toolbar controls</option><option value="chrome">All Window controls</option></select></label><label className="teacher-checkbox"><input type="checkbox" checked={groupSound.onlyEmpty} onChange={(event) => setGroupSound((current) => ({ ...current, onlyEmpty: event.target.checked }))} />Only empty assignments</label><button type="button" className="studio-button primary" disabled={!groupSound.assetId || !writeEnabled} onClick={() => updateShell((shell) => assignSoundGroup(shell, groupSound.section, groupSound.assetId, groupSound.onlyEmpty))}>Apply sound</button></div><div className="teacher-asset-library"><h3>Asset library · {Object.keys(project.assets).length}</h3>{Object.values(project.assets).sort((a, b) => a.originalFilename.localeCompare(b.originalFilename)).map((asset) => <article key={asset.assetId}><span><strong>{asset.originalFilename}</strong><small>{Math.ceil(asset.sizeBytes / 1024)} KB · {usage.get(asset.assetId)?.length || 0} uses</small></span>{asset.mediaType.startsWith("audio/") && <button type="button" className="studio-button secondary" disabled={!urls[asset.assetId]} onClick={() => new Audio(urls[asset.assetId]).play().catch(() => {})}>Test sound</button>}<button type="button" className="studio-button secondary danger" disabled={usage.has(asset.assetId) || !writeEnabled} title={usage.has(asset.assetId) ? "Asset is still being used" : "Remove unused asset"} onClick={() => removeUnused(asset)}>Remove unused</button></article>)}</div><TeacherProjectQaPanel shell={draftShell} urls={urls} focusId={qaFocus} onFocus={setQaFocus} /></div>;
    return <div className="teacher-project-section"><p>Export validates the saved revision, builds the isolated generic Teacher runtime, syncs Capacitor, assembles and verifies a debug APK. Run installs and launches the fixed Teacher application ID.</p>{dirty && <p className="teacher-save-first" role="status">Save the current draft before Export APK or Run.</p>}{buildState.job && <div className={`teacher-build-job ${buildState.job.status}`} role="status"><strong>{buildState.job.stage}</strong><span>{buildState.job.status === "complete" ? buildState.job.result?.apkFilename : `Job ${buildState.job.jobId.slice(0, 8)} · ${buildState.job.status}`}</span></div>}{buildState.error && <p className="studio-validation-errors" role="alert">{buildState.error}</p>}{buildState.devices.length > 1 && <div className="teacher-device-picker"><label><span>Android target</span><select value={buildState.selectedSerial} onChange={(event) => setBuildState((current) => ({ ...current, selectedSerial: event.target.value }))}><option value="">Select an emulator/device</option>{buildState.devices.map((device) => <option value={device.serial} key={device.serial}>{device.model || device.device || "Android device"} · {device.serial}</option>)}</select></label><button type="button" className="studio-button primary" disabled={!buildState.selectedSerial} onClick={() => startRun(buildState.selectedSerial)}>Install and launch</button></div>}</div>;
  };
  return <main className="teacher-project-editor" id="main-content">
    <header className="teacher-project-editor-header"><div><a href="#/" className="studio-back-link"><ArrowLeft aria-hidden="true" />Back to projects</a><input aria-label="Project display name" value={state.draftName} disabled={!writeEnabled} onChange={(event) => setState((current) => ({ ...current, draftName: event.target.value }))} /><p>{project.projectId} · Revision {project.revision} · <strong>{dirty ? "Unsaved" : "Saved"}</strong></p><span>{progress.configuredCount} / {progress.requiredCount} configured · {progress.missingCount} missing</span></div><div className="teacher-project-editor-actions"><button className="studio-button secondary" type="button" disabled={!writeEnabled} onClick={() => setImportOpen(true)}><Import aria-hidden="true" />Import Assets</button><button className="studio-button primary" type="button" disabled={!writeEnabled || saveState.pending || !dirty} onClick={save}><Save aria-hidden="true" />{saveState.pending ? "Saving…" : "Save"}</button><button className="studio-button secondary" type="button" disabled={!writeEnabled || dirty || !progress.complete || buildBusy} onClick={startExport} title={dirty ? "Save first" : !progress.complete ? "Complete all required assignments" : "Export debug APK"}><Download aria-hidden="true" />Export APK</button><button className="studio-button secondary" type="button" disabled={!writeEnabled || dirty || !progress.complete || buildBusy} onClick={chooseRunTarget} title={dirty ? "Save first" : "Install on Android"}><Play aria-hidden="true" />Run</button></div></header>
    {saveState.message && <p className="teacher-project-save-status" role="status">{saveState.message}</p>}
    <div className={`teacher-project-editor-layout ${previewExpanded ? "preview-expanded" : ""}`}><nav className="teacher-project-navigation" aria-label="Teacher Project sections">{TEACHER_PROJECT_SECTIONS.map(([id, label]) => { const sectionProgress = progress.sections[id]; const note = id === "assets" ? `${Object.values(project.assets).filter((asset) => !usage.has(asset.assetId)).length} unused` : sectionProgress ? sectionProgress.complete ? "Complete" : `${sectionProgress.missingCount} missing` : id === "overview" ? `${progress.configuredCount}/${progress.requiredCount}` : dirty ? "Save first" : "Ready"; return <button type="button" key={id} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><span>{label}</span><small>{sectionProgress?.complete && <CheckCircle2 aria-hidden="true" />}{note}</small></button>; })}</nav><section className="teacher-project-workspace" aria-labelledby="teacher-section-title"><header><div><span className="studio-eyebrow">Current section</span><h2 id="teacher-section-title">{TEACHER_PROJECT_SECTIONS.find(([id]) => id === section)?.[1]}</h2></div>{section !== "overview" && <span>{progress.sections[section] ? `${progress.sections[section].configured} / ${progress.sections[section].required}` : "Authoring tools"}</span>}</header>{renderSection()}</section><aside className="teacher-project-preview-panel"><div className="teacher-project-preview-heading"><div><AppWindow aria-hidden="true" /><span><strong>Live Teacher preview</strong><small>Shared runtime · 1920 × 1080</small></span></div><button type="button" className="studio-icon-button" aria-label={previewExpanded ? "Restore preview" : "Expand preview"} aria-pressed={previewExpanded} onClick={() => setPreviewExpanded((value) => !value)}><Expand aria-hidden="true" /></button><div role="group" aria-label="Preview viewport">{VIEWPORTS.map((item) => <button key={item.id} type="button" aria-pressed={viewport.id === item.id} onClick={() => setViewport(item)}>{item.id}</button>)}</div></div>{runtime && <PreviewCanvas config={runtime} viewport={viewport} qaFocus={qaFocus} />}</aside></div>
    <TeacherProjectBulkImport open={importOpen} project={project} shell={draftShell} writeEnabled={writeEnabled} onClose={() => setImportOpen(false)} onApplied={({ project: nextProject, shell, message }) => { setState((current) => ({ ...current, project: nextProject, draftShell: shell })); setSaveState({ pending: false, message }); }} />
  </main>;
}

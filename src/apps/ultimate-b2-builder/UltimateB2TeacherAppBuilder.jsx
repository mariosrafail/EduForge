import { AlertTriangle, Image as ImageIcon, Save, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import TeacherProjectShell from "../android-teacher-project/TeacherProjectShell.jsx";
import { ClassroomToolsProvider } from "../android-teacher-offline/ClassroomToolsContext.jsx";
import {
  ULTIMATE_B2_TEACHER_APP_CONFIG_ENDPOINT,
  ULTIMATE_B2_TEACHER_APP_IMPORT_ENDPOINT,
  ultimateB2TeacherAppAssetUrl,
} from "../../data/ultimate-b2/teacherAppAuthoring.js";

const sections = Object.freeze([
  ["overview", "Overview"], ["pages", "Pages / Spreads"], ["shell", "Shell / Background"],
  ["navigation", "Navigation / Window Controls"], ["book-switches", "Book Switch Controls"], ["navibar-assets", "Navibar Assets"],
  ["units", "Units"], ["editions", "Editions"],
  ["extras", "Extras Menu"], ["toolbar", "Teacher Toolbar"], ["sounds", "Sounds / Assets"], ["preview", "Preview"],
]);

function currentUrl(id, draftUrls, revision) {
  return draftUrls[id] || ultimateB2TeacherAppAssetUrl(id, revision);
}

function fileAccept(binding) {
  if (binding.mediaType === "audio/mpeg") return "audio/mpeg,audio/wav,.mp3,.wav";
  if (binding.mediaType === "application/x-gaf") return ".gaf,application/octet-stream,application/x-gaf";
  return binding.role === "animation-atlas" ? "image/png" : "image/png,image/jpeg,image/webp";
}

function AssetSlot({ binding, label, revision, draftUrls, onImport, warning = "" }) {
  const source = currentUrl(binding.id, draftUrls, revision);
  const raster = binding.mediaType.startsWith("image/");
  return (
    <article className="b2-teacher-asset-slot" data-asset-id={binding.id}>
      <div className="b2-teacher-asset-preview">{raster ? <img src={source} alt="" draggable="false" /> : <Upload aria-hidden="true" />}</div>
      <div className="b2-teacher-asset-copy">
        <strong>{label}</strong><small>{binding.id}</small>
        <span title={binding.repositoryPath}>{binding.originalFilename || binding.repositoryPath.split("/").at(-1)}</span>
        {warning && <em><AlertTriangle aria-hidden="true" /> {warning}</em>}
      </div>
      <label className="b2-teacher-browse"><input type="file" accept={fileAccept(binding)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onImport(binding, file); }} /><Upload size={16} /> Browse / Replace</label>
    </article>
  );
}

function assetPair(items, revision, draftUrls, onImport, warnings) {
  return items.flatMap((item) => [
    <AssetSlot key={item.normal.id} binding={item.normal} label={`${item.label} — normal`} {...{ revision, draftUrls, onImport }} warning={warnings[item.normal.id]} />,
    <AssetSlot key={item.active.id} binding={item.active} label={`${item.label} — active`} {...{ revision, draftUrls, onImport }} warning={warnings[item.active.id]} />,
  ]);
}

async function imageRatio(file) {
  if (!file.type.startsWith("image/")) return null;
  const bitmap = await createImageBitmap(file);
  const ratio = bitmap.width / bitmap.height;
  bitmap.close();
  return ratio;
}

async function sourceImageRatio(source) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : null);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

export function UltimateB2TeacherAppBuilder({ onSaved }) {
  const [section, setSection] = useState("overview");
  const [model, setModel] = useState(null);
  const [overrides, setOverrides] = useState(null);
  const [revision, setRevision] = useState("");
  const [draftUrls, setDraftUrls] = useState({});
  const [warnings, setWarnings] = useState({});
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [selectedPageId, setSelectedPageId] = useState("");
  const dirty = Object.keys(draftUrls).length > 0;

  useEffect(() => {
    let mounted = true;
    fetch(ULTIMATE_B2_TEACHER_APP_CONFIG_ENDPOINT, { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Teacher App configuration could not be loaded.");
      if (!mounted) return;
      setModel(payload.model); setOverrides(payload.overrides); setSelectedPageId(payload.model.pages[0]?.id || ""); setRevision(Date.now().toString()); setStatus("Ready");
    }).catch((reason) => { if (mounted) { setError(reason.message); setStatus("Load failed"); } });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    const beforeUnload = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const importAsset = async (binding, file) => {
    setStatus(`Importing ${file.name}…`); setError("");
    try {
      const previousRatio = binding.width && binding.height ? binding.width / binding.height : await sourceImageRatio(currentUrl(binding.id, draftUrls, revision));
      const nextRatio = await imageRatio(file);
      const response = await fetch(`${ULTIMATE_B2_TEACHER_APP_IMPORT_ENDPOINT}?id=${encodeURIComponent(binding.id)}`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "X-Original-Filename": encodeURIComponent(file.name) }, body: file });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Asset import failed.");
      setOverrides((current) => ({ ...current, assets: { ...current.assets, [binding.id]: payload.override } }));
      setModel((current) => ({ ...current, assets: { ...current.assets, [binding.id]: { ...current.assets[binding.id], ...payload.override } }, pages: current.pages.map((page) => page.assetBindingId === binding.id ? { ...page, image: { ...page.image, ...payload.override } } : page) }));
      setDraftUrls((current) => { if (current[binding.id]) URL.revokeObjectURL(current[binding.id]); return { ...current, [binding.id]: URL.createObjectURL(file) }; });
      if (binding.role === "page" && previousRatio && nextRatio && Math.abs(nextRatio / previousRatio - 1) > 0.03) setWarnings((current) => ({ ...current, [binding.id]: "Aspect ratio changed; review existing percentage-based hotspots manually." }));
      setStatus("Unsaved changes");
    } catch (reason) { setError(reason.message); setStatus("Import failed"); }
  };

  const save = async () => {
    setStatus("Saving…"); setError("");
    try {
      const response = await fetch(ULTIMATE_B2_TEACHER_APP_CONFIG_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(overrides) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Teacher App configuration could not be saved.");
      Object.values(draftUrls).forEach((url) => URL.revokeObjectURL(url));
      setDraftUrls({}); setModel(payload.model); setOverrides(payload.overrides);
      const nextRevision = Date.now().toString(); setRevision(nextRevision); setStatus("Saved"); onSaved?.(nextRevision);
    } catch (reason) { setError(reason.message); setStatus("Save failed"); }
  };

  const runtimePreview = useMemo(() => {
    if (!model) return null;
    const source = (binding) => currentUrl(binding.id, draftUrls, revision);
    return {
      projectId: "ultimate-b2", displayName: "Ultimate B2", background: source(model.shell.background), publisherLogo: source(model.shell.publisherLogo),
      titleAnimation: { gaf: source(model.shell.titleAnimation.gaf), sdAtlases: model.shell.titleAnimation.sd.map(source), hdAtlases: model.shell.titleAnimation.hd.map(source), accessibleLabel: "Ultimate English B2" },
      units: model.shell.units.map((item) => ({ ...item, normal: source(item.normal), active: source(item.active) })),
      editions: model.shell.editions.map((item) => ({ ...item, normal: source(item.normal), active: source(item.active) })),
      extras: model.shell.extras.map((item) => ({ ...item, normal: source(item.normal), active: source(item.active) })),
      toolbar: model.shell.toolbar.map((item) => ({ ...item, normal: source(item.normal), active: source(item.active), sound: source(item.sound) })),
    };
  }, [model, draftUrls, revision]);
  if (!model || !overrides) return <main className="b2-teacher-app-builder"><p>{error || status}</p></main>;
  const selectedPage = model.pages.find((page) => page.id === selectedPageId) || model.pages[0];
  const slot = (binding, label) => <AssetSlot key={binding.id} {...{ binding, label, revision, draftUrls, onImport: importAsset }} warning={warnings[binding.id]} />;
  const groupedPages = Array.from({ length: 10 }, (_, index) => index + 1).map((unitNumber) => ({ unitNumber, pages: model.pages.filter((page) => page.unitNumber === unitNumber) }));

  return (
    <main className="b2-teacher-app-builder">
      <header className="b2-teacher-app-header"><div><span>Ultimate B2 bound authoring</span><h1>UI Controller</h1><p>Repository-backed shell and all 110 page identities used by the Teacher pack. Canonical activities remain enabled only where authored.</p></div><div className="b2-teacher-save-state" role="status"><strong>{status}</strong>{error && <small>{error}</small>}<button type="button" onClick={save} disabled={!dirty || status === "Saving…"}><Save size={17} /> Save</button></div></header>
      <nav className="b2-teacher-section-tabs" aria-label="UI Controller authoring sections">{sections.map(([id, label]) => <button key={id} type="button" aria-selected={section === id} onClick={() => setSection(id)}>{label}</button>)}</nav>
      <div className="b2-teacher-layout">
        <section className="b2-teacher-editor-panel">
          {section === "overview" && <div className="b2-teacher-overview"><h2>Canonical B2 setup</h2><dl><div><dt>Pages / spreads</dt><dd>{model.pages.length}</dd></div><div><dt>Stable page IDs</dt><dd>{new Set(model.pages.map((page) => page.id)).size}</dd></div><div><dt>Canonical asset bindings</dt><dd>{Object.keys(model.assets).length}</dd></div><div><dt>Saved replacements</dt><dd>{Object.keys(overrides.assets).length}</dd></div></dl><p>The initial bindings point at the currently tracked B2 artwork. Replacements change only asset bindings; page, hotspot, activity and control IDs stay unchanged.</p></div>}
          {section === "pages" && <div className="b2-teacher-pages"><h2>Students Book pages / spreads</h2>{groupedPages.map((group) => <section key={group.unitNumber}><h3>Unit {group.unitNumber}</h3>{group.pages.map((page) => <div key={page.id} className="b2-teacher-page-row" onClick={() => setSelectedPageId(page.id)} data-selected={page.id === selectedPage.id || undefined}>{slot(page.image, `${page.printedLabel} — ${page.sectionTitle}`)}<dl><div><dt>Page ID</dt><dd><code>{page.id}</code></dd></div><div><dt>Part / order</dt><dd>{page.partNumber} / {page.navigationOrder}</dd></div><div><dt>Logical asset</dt><dd><code>{page.logicalAssetIdentity}</code></dd></div></dl></div>)}</section>)}</div>}
          {section === "shell" && <div className="b2-teacher-assets"><h2>Shell / background</h2>{slot(model.shell.background, "Main classroom background")}{slot(model.shell.studentsBookPartsBackground, "Students Book parts background")}{slot(model.shell.publisherLogo, "Publisher logo")}{slot(model.shell.titleAnimation.gaf, "Title animation GAF")}{model.shell.titleAnimation.sd.map((item, index) => slot(item, `Title SD atlas ${index + 1}`))}{model.shell.titleAnimation.hd.map((item, index) => slot(item, `Title HD atlas ${index + 1}`))}</div>}
          {section === "navigation" && <div className="b2-teacher-assets"><h2>Currently wired navigation / window controls</h2>{Object.entries(model.shell.navigation).map(([id, binding]) => slot(binding, id.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase())))}<section className="b2-teacher-asset-group"><h3>Reveal activity controls</h3><p>These publisher Navibar variants are the effective runtime bindings for Reload, Show All and Show Next.</p>{model.shell.revealControls.flatMap((control) => [slot(control.active, `${control.label} — active`), slot(control.pressed, `${control.label} — pressed`), slot(control.disabled, `${control.label} — disabled`)])}</section></div>}
          {section === "book-switches" && <div className="b2-teacher-assets"><h2>Book switch controls</h2><p>These three publisher controls are wired into the bottom Teacher navigation. Students Book remains current; Grammar Book and Workbook do not route to content yet.</p>{model.shell.bookSwitches.map((item) => slot(item.asset, item.label))}</div>}
          {section === "navibar-assets" && <div className="b2-teacher-assets"><h2>Navibar Asset Library</h2><p>Publisher assets catalogued for future wiring. Effective book-switch and reveal-control bindings are edited in their dedicated sections.</p>{model.shell.navibarAssets.filter((item) => !model.shell.bookSwitches.some((book) => book.asset.id === item.binding.id) && !model.shell.revealControls.some((control) => [control.active.id, control.pressed.id, control.disabled.id].includes(item.binding.id))).map((item) => slot(item.binding, item.label))}</div>}
          {section === "units" && <div className="b2-teacher-assets"><h2>Units</h2>{assetPair(model.shell.units, revision, draftUrls, importAsset, warnings)}</div>}
          {section === "editions" && <div className="b2-teacher-assets"><h2>Book editions</h2>{assetPair(model.shell.editions, revision, draftUrls, importAsset, warnings)}<p>Launcher edition artwork remains separate from the three bottom-navigation book-switch controls.</p></div>}
          {section === "extras" && <div className="b2-teacher-assets"><h2>Extras Menu</h2>{["left", "right"].map((column) => <section key={column} className="b2-teacher-asset-group"><h3>{column === "left" ? "Left column" : "Right column"}</h3>{assetPair(model.shell.extras.filter((item) => item.column === column).sort((left, right) => left.order - right.order), revision, draftUrls, importAsset, warnings)}</section>)}</div>}
          {section === "toolbar" && <div className="b2-teacher-assets"><h2>Teacher Toolbar</h2>{assetPair(model.shell.toolbar, revision, draftUrls, importAsset, warnings)}</div>}
          {section === "sounds" && <div className="b2-teacher-assets"><h2>Sounds / supporting assets</h2>{Object.entries(model.shell.sounds).map(([id, binding]) => slot(binding, `${id} sound`))}{slot(model.shell.activityHotspot, "Activity hotspot artwork")}{slot(model.assets["toolbar.keyboard.normal"], "On-screen keyboard — normal")}{slot(model.assets["toolbar.keyboard.active"], "On-screen keyboard — active")}{Object.entries(model.shell.mediaPlayer).map(([id, binding]) => slot(binding, `Media player ${id}`))}</div>}
          {section === "preview" && <div className="b2-teacher-preview-info"><h2>Live preview</h2><p>This preview uses the shared Teacher shell presentation and the current draft bindings. The selected page is shown without stretching or cropping.</p></div>}
        </section>
        <aside className="b2-teacher-live-preview" aria-label="Ultimate B2 UI Controller live preview"><header><strong>Live B2 shell preview</strong><span>{dirty ? "Draft" : "Saved"}</span></header><div className="b2-teacher-preview-viewport"><div className="b2-teacher-preview-stage teacher-offline-settings-surface"><ClassroomToolsProvider><TeacherProjectShell config={runtimePreview} editing animationsActive={false} /></ClassroomToolsProvider></div></div><label>Preview page / spread<select value={selectedPage.id} onChange={(event) => setSelectedPageId(event.target.value)}>{model.pages.map((page) => <option key={page.id} value={page.id}>Unit {page.unitNumber} · {page.printedLabel} · {page.sectionTitle}</option>)}</select></label><div className="b2-teacher-page-preview"><img src={currentUrl(selectedPage.image.id, draftUrls, revision)} alt={`Unit ${selectedPage.unitNumber}, ${selectedPage.printedLabel}`} /></div><small><ImageIcon size={14} /> Aspect ratio preserved · hotspot geometry remains percentage-based</small></aside>
      </div>
    </main>
  );
}

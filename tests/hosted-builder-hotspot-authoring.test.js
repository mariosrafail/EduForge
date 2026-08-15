import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(file, "utf8");

test("hosted Hotspot Builder reuses the proven editor and exposes explicit persistence state", async () => {
  const editor = await read("src/apps/ultimate-b2-builder/HostedUltimateB2HotspotBuilder.jsx");
  assert.match(editor, /EditableHotspotLayer/);
  assert.match(editor, /ultimateB2StudentsBookPageUnits/);
  assert.match(editor, /android-content-packs\/ultimate-b2-students-book\/catalog\.json/);
  assert.match(editor, /setStatus\("Loading"\)/);
  assert.match(editor, /setStatus\("Ready"\)/);
  assert.match(editor, /setStatus\("Unsaved changes"\)/);
  assert.match(editor, /setStatus\("Saving"\)/);
  assert.match(editor, /setStatus\("Saved"\)/);
  assert.match(editor, /setStatus\("Save failed"\)/);
  assert.match(editor, /setStatus\("Conflict"\)/);
  assert.match(editor, /beforeunload/);
  assert.match(editor, /Reload latest/);
  assert.match(editor, /expectedRevision: revision/);
  assert.match(editor, /clientMutationId: mutationId\.current/);
  assert.match(editor, /disabled=\{!dirty \|\| status === "Saving"\}/);
  assert.match(editor, /Drag on the page to create a hotspot/);
  assert.match(editor, /Delete hotspot/);
  assert.match(editor, /registerToolContext\("hotspots"/);
  assert.match(editor, /view: "page"/);
  assert.match(editor, /pageId: page\.id/);
  assert.match(editor, /refreshKey: viewerRefreshKey/);
  assert.doesNotMatch(editor, /<HostedViewerPreview\b/);
});

test("hosted conflict handling retains local edits until explicit reload", async () => {
  const editor = await read("src/apps/ultimate-b2-builder/HostedUltimateB2HotspotBuilder.jsx");
  const conflict = editor.match(/if \(requestError instanceof BuilderContentApiError[\s\S]*?\n\s*\} else/)?.[0] || "";
  assert.match(conflict, /setConflictRevision/);
  assert.match(conflict, /setStatus\("Conflict"\)/);
  assert.match(conflict, /Your unsaved changes are still here/);
  assert.doesNotMatch(conflict, /setManifest|setDirty\(false\)|loadLatest/);
  assert.match(editor, /onClick=\{\(\) => loadLatest\(\)/);
});

test("Viewer refresh advances only after a successful persisted hotspot save", async () => {
  const editor = await read("src/apps/ultimate-b2-builder/HostedUltimateB2HotspotBuilder.jsx");
  const saveBody = editor.match(/async function save\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  const success = saveBody.match(/setManifest\(payload\.document\)[\s\S]*?setViewerRefreshKey\(\(value\) => value \+ 1\)/)?.[0] || "";
  assert.match(success, /setStatus\("Saved"\)/);
  assert.equal([...saveBody.matchAll(/setViewerRefreshKey/g)].length, 1);
  assert.doesNotMatch(saveBody.match(/if \(payload\.currentRevision > payload\.revision\) \{[\s\S]*?return;\n      \}/)?.[0] || "", /setViewerRefreshKey/);
  assert.doesNotMatch(saveBody.match(/status === 409[\s\S]*?\} else/)?.[0] || "", /setViewerRefreshKey/);
});

test("adapter capabilities expose only hotspots and supported activities as writable tools", async () => {
  const [adapters, shell, workspace] = await Promise.all([
    read("src/apps/book-builder/hosted/hostedBuilderAdapters.jsx"),
    read("src/apps/book-builder/hosted/HostedBookBuilderApp.jsx"),
    read("src/apps/ultimate-b2-builder/HostedUltimateB2BuilderApp.jsx"),
  ]);
  assert.match(adapters, /hotspots: Object\.freeze\(\{ readable: true, writable: true \}\)/);
  assert.match(adapters, /activities: Object\.freeze\(\{ readable: true, writable: true \}\)/);
  assert.match(adapters, /uiController: Object\.freeze\(\{ readable: true, writable: true \}\)/);
  assert.match(shell, /tools\.filter\(\(\{ capability \}\) => adapter\.capabilities\[capability\]\?\.readable\)/);
  assert.match(shell, /adapter\.capabilities\[capability\]\.writable \? "Editable" : "Read-only"/);
  assert.match(workspace, /HostedTeacherUiController/);
  assert.match(workspace, /Open Response · Editable/);
  assert.match(workspace, /Unsupported type · Read-only/);
  assert.doesNotMatch(workspace, /ReadOnlyBanner|persistence pending/);
  assert.match(workspace, /Add Activity/);
  assert.match(workspace, /NativeActivityFoundationEditor/);
  assert.match(workspace, /included in Publication v2/);
  assert.doesNotMatch(workspace, /upload|FormData/i);
});

test("hosted and local hotspot persistence transports stay deliberately separate", async () => {
  const [hostedClient, hostedEditor, localEditor, localPlugin] = await Promise.all([
    read("src/apps/book-builder/hosted/builderContentApi.js"),
    read("src/apps/ultimate-b2-builder/HostedUltimateB2HotspotBuilder.jsx"),
    read("src/apps/ultimate-b2-builder/UltimateB2HotspotBuilder.jsx"),
    read("scripts/ultimate-b2/hotspot-builder-vite-plugin.mjs"),
  ]);
  assert.match(hostedClient, /\/builder\/api\/content/);
  assert.match(hostedClient, /method: "PUT"/);
  assert.doesNotMatch(`${hostedClient}\n${hostedEditor}`, /__hhplms|repositoryFileTarget|writeAuthoringJson/);
  assert.match(localEditor, /\/__hhplms\/ultimate-b2-hotspots/);
  assert.match(localEditor, /\/__hhplms\/book-menu-skin-selection/);
  assert.match(localPlugin, /writeAuthoringJson/);
  assert.match(localPlugin, /loopbackAddresses/);
  assert.doesNotMatch(`${localEditor}\n${localPlugin}`, /\/builder\/api\/content/);
});

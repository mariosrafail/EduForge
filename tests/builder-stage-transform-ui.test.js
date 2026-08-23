import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the shared selection frame exposes four corners, pointer cancellation, locks, and keyboard movement", async () => {
  const [frame, geometry] = await Promise.all([
    read("src/components/builder-studio/StageSelectionFrame.jsx"),
    read("src/components/builder-studio/stageGeometry.js"),
  ]);
  assert.match(geometry, /\["nw", "ne", "sw", "se"\]/);
  assert.match(frame, /STAGE_RESIZE_HANDLES\.map/);
  assert.match(frame, /onPointerCancel=\{\(event\) => finish\(event, true\)\}/);
  assert.match(frame, /locked \? <LockKeyhole/);
  assert.match(frame, /ArrowLeft/);
  assert.match(frame, /event\.shiftKey \? 10 : 1/);
  assert.match(frame, /\["Delete", "Backspace"\]/);
  assert.match(frame, /event\.key === "Escape"/);
});

test("Image and Open Response use the same scaled transform frame", async () => {
  const [imageEditor, openResponseEditor] = await Promise.all([
    read("src/apps/book-builder/hosted/NativeImageEditor.jsx"),
    read("src/apps/book-builder/hosted/NativeOpenResponseEditor.jsx"),
  ]);
  assert.match(imageEditor, /<StageSelectionFrame/);
  assert.match(imageEditor, /preserveAspectRatio/);
  assert.match(imageEditor, /locked=\{selectedImage\.locked\}/);
  assert.match(openResponseEditor, /<StageSelectionFrame/);
  assert.doesNotMatch(openResponseEditor, /preserveAspectRatio=\{selection\.type === "artwork"\}/);
  assert.match(openResponseEditor, /moveFromGrip=\{selection\.type !== "artwork"\}/);
  assert.doesNotMatch(`${imageEditor}\n${openResponseEditor}`, /native-or-resize/);
});

test("Open Response keeps every layout control above a fitted, scrollbar-free panning canvas", async () => {
  const [editor, studioCss] = await Promise.all([
    read("src/apps/book-builder/hosted/NativeOpenResponseEditor.jsx"),
    read("src/apps/ultimate-b2-builder/studioAuthoring.css"),
  ]);
  assert.doesNotMatch(editor, /native-or-properties studio-inspector/);
  assert.match(editor, /native-or-toolbar-actions/);
  assert.match(editor, /Artwork Layers/);
  assert.match(editor, /ResizeObserver/);
  assert.match(editor, /uploaded\.metadata/);
  assert.match(studioCss, /\.studio-open-response \.studio-canvas-viewport::-webkit-scrollbar/);
  assert.match(studioCss, /scrollbar-width: none/);
  assert.match(studioCss, /\.studio-open-response \.studio-or-layout \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
});

test("hotspots share geometry utilities and expose selected-only four-corner handles", async () => {
  const layer = await read("src/components/lms/books/BookPageImagePanel.jsx");
  assert.match(layer, /transformStageGeometry/);
  assert.match(layer, /stageGeometryToPercent/);
  assert.match(layer, /editing && selected && STAGE_RESIZE_HANDLES\.map/);
  assert.match(layer, /startResize\(event, area, handle\)/);
  assert.match(layer, /onPointerCancel=\{\(event\) => finishDrag\(event, true\)\}/);
});

test("studio controls are scoped, semantic, responsive, and authored regions disable native resizing", async () => {
  const [controls, studioCss, surfaceCss] = await Promise.all([
    read("src/components/builder-studio/StudioControls.jsx"),
    read("src/apps/ultimate-b2-builder/studioAuthoring.css"),
    read("src/components/native-open-response/nativeOpenResponseSurface.css"),
  ]);
  assert.match(controls, /role="tablist"/);
  assert.match(controls, /role="tab"/);
  assert.match(controls, /ArrowRight/);
  assert.match(studioCss, /\.studio-editor/);
  assert.match(studioCss, /@media \(max-width: 1180px\)/);
  assert.match(studioCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(surfaceCss, /resize:none/);
});

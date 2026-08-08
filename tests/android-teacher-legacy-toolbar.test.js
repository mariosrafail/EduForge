import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedOrder = [
  "mouse", "pencil", "marker", "eraser", "clear", "zoom", "hide", "show", "undo",
  "redo", "text", "annotations", "url", "save", "load", "timer", "score", "print",
];

test("Ultimate B2 teacher toolbar keeps the recovered legacy order and assets", async () => {
  const [assets, toolbar, adapter] = await Promise.all([
    readFile("src/apps/android-teacher-offline/legacyClassroomAssets.js", "utf8"),
    readFile("src/apps/android-teacher-offline/ClassroomToolbar.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/UltimateB2ClassroomToolbar.jsx", "utf8"),
  ]);
  const itemBlock = assets.match(/ultimateB2TeacherToolbarItems = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || "";
  const actualOrder = [...itemBlock.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(actualOrder, expectedOrder);
  for (const id of expectedOrder) {
    const assetName = id === "annotations" ? "custom-page" : id === "load" ? "open" : id;
    assert.match(assets, new RegExp(`button-${assetName}\\.png`));
    assert.match(assets, new RegExp(`button-${assetName}-active\\.png`));
  }
  assert.match(toolbar, /useClassroomTools\(\)/);
  assert.match(toolbar, /pointer: "mouse"[\s\S]*pen: "pencil"[\s\S]*eraser: "eraser"[\s\S]*text: "text"[\s\S]*cover: "hide"[\s\S]*spotlight: "show"[\s\S]*"zoom-region": "zoom"/);
  assert.match(toolbar, /UI_ONLY_TOOLS = new Set\(\["marker", "annotations", "url", "save", "load"\]\)/);
  assert.match(toolbar, /aria-pressed=\{selected\}/);
  const iconButton = toolbar.match(/function LegacyTeacherToolButton[\s\S]*?^}/m)?.[0] || "";
  assert.doesNotMatch(iconButton, /disabled|aria-disabled|lock/i);
  for (const behavior of [
    'enterMode("pen")', 'enterMode("eraser")', 'togglePanel("clear")', 'enterMode("zoom-region")',
    'enterMode("cover")', 'enterMode("spotlight")', "undoDrawing(surfaceKey)", "redoDrawing(surfaceKey)",
    'enterMode("text")', 'togglePanel("timer")', 'togglePanel("scoreboard")', "printCurrentView()",
  ]) assert.ok(toolbar.includes(behavior), `${behavior} must stay wired`);
  assert.match(toolbar, /selectMouse[\s\S]*setActiveTool\("pointer"\)[\s\S]*resetRegionZoom\(surfaceKey\)/);
  assert.doesNotMatch(toolbar, /lucide-react|window\.open|fetch\(|XMLHttpRequest|showSaveFilePicker/);
  assert.doesNotMatch(toolbar, /legacyClassroomAssets|ultimateB2TeacherToolbarItems/);
  assert.match(adapter, /ultimateB2TeacherToolbarItems/);
  assert.match(adapter, /<ClassroomToolbar [^>]*items=\{ultimateB2TeacherToolbarItems\}/);
});

test("Ultimate B2 teacher toolbar CSS exposes transparent, hover, press, and selected states", async () => {
  const [styles, rootStyles] = await Promise.all([
    readFile("src/apps/android-teacher-offline/legacyTeacherToolbar.css", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherOfflineRoot.css", "utf8"),
  ]);

  assert.match(rootStyles, /@import "\.\/legacyTeacherToolbar\.css";/);
  assert.match(styles, /\.legacy-classroom-viewer-toolbar\.classroom-teaching-toolbar[\s\S]*background: transparent;/);
  assert.match(styles, /grid-template-columns: repeat\(var\(--teacher-toolbar-slot-count, 18\), minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.legacy-teacher-tool-icon-stack \{[\s\S]*transform: none;/);
  assert.match(styles, /\[aria-pressed="true"\] \.legacy-teacher-tool-icon-stack \{ transform: none; \}/);
  assert.match(styles, /> \.legacy-teacher-tool-button:active \{ transform: none; \}/);
  assert.match(styles, /\.legacy-teacher-tool-button:active \.legacy-teacher-tool-icon-stack \{ transform: none; \}/);
  assert.doesNotMatch(styles, /\.legacy-teacher-tool-(?:button|icon-stack)[^{]*\{[^}]*transform: scale\(/);
  assert.match(styles, /\[aria-pressed="true"\] \.legacy-teacher-tool-icon-normal \{ opacity: 0; \}/);
  assert.match(styles, /\[aria-pressed="true"\] \.legacy-teacher-tool-icon-active \{ opacity: 1; \}/);
  assert.match(styles, /\.legacy-teacher-tool-button:active \.legacy-teacher-tool-icon-active \{ opacity: 1; \}/);
  assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*:hover \.legacy-teacher-tool-icon-active \{ opacity: 1; \}/);
  assert.match(styles, /cursor: pointer;/);
  assert.match(styles, /calc\(100vw - max\(8px, env\(safe-area-inset-left\)\) - max\(8px, env\(safe-area-inset-right\)\)\)/);
  assert.doesNotMatch(styles, /linear-gradient/);
});

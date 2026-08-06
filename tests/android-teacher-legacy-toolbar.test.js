import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedOrder = [
  "mouse", "pencil", "marker", "eraser", "clear", "zoom", "hide", "show", "undo",
  "redo", "text", "annotations", "url", "save", "load", "timer", "score", "print",
];

test("Ultimate B2 teacher toolbar keeps the recovered legacy order and assets", async () => {
  const [assets, toolbar] = await Promise.all([
    readFile("src/apps/android-teacher-offline/legacyClassroomAssets.js", "utf8"),
    readFile("src/apps/android-teacher-offline/ClassroomToolbar.jsx", "utf8"),
  ]);
  const itemBlock = assets.match(/ultimateB2TeacherToolbarItems = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || "";
  const actualOrder = [...itemBlock.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(actualOrder, expectedOrder);
  for (const id of expectedOrder) {
    const assetName = id === "annotations" ? "custom-page" : id === "load" ? "open" : id;
    assert.match(assets, new RegExp(`button-${assetName}\\.png`));
    assert.match(assets, new RegExp(`button-${assetName}-active\\.png`));
  }
  assert.match(toolbar, /useState\("mouse"\)/);
  assert.match(toolbar, /aria-pressed=\{selected\}/);
  assert.equal((toolbar.match(/onClick=/g) || []).length, 1, "toolbar clicks only select one local item");
  assert.doesNotMatch(toolbar, /useClassroomTools|setActiveTool|setOpenPanel|globalThis\.print|lucide-react/);
});

test("Ultimate B2 teacher toolbar CSS exposes transparent, hover, press, and selected states", async () => {
  const [styles, rootStyles] = await Promise.all([
    readFile("src/apps/android-teacher-offline/legacyTeacherToolbar.css", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherOfflineRoot.css", "utf8"),
  ]);

  assert.match(rootStyles, /@import "\.\/legacyTeacherToolbar\.css";/);
  assert.match(styles, /\.legacy-classroom-viewer-toolbar\.classroom-teaching-toolbar[\s\S]*background: transparent;/);
  assert.match(styles, /grid-template-columns: repeat\(18, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\[aria-pressed="true"\] \.legacy-teacher-tool-icon-stack \{ transform: scale\(1\.2\); \}/);
  assert.match(styles, /\.legacy-teacher-tool-button:active \.legacy-teacher-tool-icon-stack \{ transform: scale\(\.8\);/);
  assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*:hover \.legacy-teacher-tool-icon-active \{ opacity: 1; \}/);
  assert.match(styles, /calc\(100vw - max\(8px, env\(safe-area-inset-left\)\) - max\(8px, env\(safe-area-inset-right\)\)\)/);
  assert.doesNotMatch(styles, /linear-gradient/);
});

export const TEACHER_PROJECT_LEGACY_SCHEMA_VERSION = "1.0";
export const TEACHER_PROJECT_SCHEMA_VERSION = "2.0";
export const TEACHER_PROJECT_KIND = "teacher-apk-project";

export const TEACHER_PROJECT_LIMITS = Object.freeze({
  rasterBytes: 16 * 1024 * 1024,
  gafBytes: 8 * 1024 * 1024,
  audioBytes: 12 * 1024 * 1024,
  totalAssetBytes: 256 * 1024 * 1024,
  atlasCountPerDensity: 8,
  entriesPerUnit: 24,
  rasterDimension: 32_768,
});

export const TEACHER_UNIT_SLOTS = Object.freeze(Array.from({ length: 10 }, (_, index) => Object.freeze({
  id: `unit-${index + 1}`,
  label: `Unit ${index + 1}`,
})));

export const TEACHER_EDITION_SLOTS = Object.freeze([
  Object.freeze({ id: "students-book", label: "Students Book" }),
  Object.freeze({ id: "workbook", label: "Workbook" }),
  Object.freeze({ id: "grammar-book", label: "Grammar Book" }),
  Object.freeze({ id: "extras", label: "Extras" }),
]);

export const TEACHER_TOOLBAR_SLOTS = Object.freeze([
  ["mouse", "Mouse"],
  ["pencil", "Pencil"],
  ["marker", "Marker"],
  ["eraser", "Eraser"],
  ["clear", "Clear screen"],
  ["zoom", "Zoom"],
  ["hide", "Hide screen"],
  ["show", "Show screen"],
  ["undo", "Undo"],
  ["redo", "Redo"],
  ["text", "Text"],
  ["annotations", "Annotations"],
  ["url", "URL"],
  ["save", "Save"],
  ["load", "Load"],
  ["timer", "Timer"],
  ["score", "Scoreboard"],
  ["print", "Print"],
].map(([id, label]) => Object.freeze({ id, label })));

export const TEACHER_CHROME_SLOTS = Object.freeze([
  Object.freeze({ id: "settings", label: "Settings" }),
  Object.freeze({ id: "minimize", label: "Minimize" }),
  Object.freeze({ id: "close", label: "Close" }),
]);

export const TEACHER_PROJECT_ASSET_FOLDERS = Object.freeze([
  "background",
  "animation",
  "chrome",
  "units",
  "editions",
  "toolbar",
  "audio",
  "pages",
]);

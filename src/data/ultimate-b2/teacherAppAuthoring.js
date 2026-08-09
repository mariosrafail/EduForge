import studentsBookRuntime from "./generated/students-book.runtime.json" with { type: "json" };
import storedOverrides from "./authoring/teacherAppAssetOverrides.json" with { type: "json" };

export const ULTIMATE_B2_TEACHER_APP_SCHEMA_VERSION = "1.0";
export const ULTIMATE_B2_TEACHER_APP_PACKAGE_ID = "ultimate-b2-students-book";
export const ULTIMATE_B2_TEACHER_APP_ASSET_ENDPOINT = "/__hhplms/ultimate-b2-teacher-app-asset";
export const ULTIMATE_B2_TEACHER_APP_CONFIG_ENDPOINT = "/__hhplms/ultimate-b2-teacher-app";
export const ULTIMATE_B2_TEACHER_APP_IMPORT_ENDPOINT = "/__hhplms/ultimate-b2-teacher-app-import";

const asset = (id, role, repositoryPath, mediaType = "image/png") => Object.freeze({ id, role, repositoryPath, mediaType });
const legacyRoot = "src/assets/books/ultimate-b2/legacy-classroom-ui";
const toolbarLabels = Object.freeze([
  ["mouse", "Mouse"], ["pencil", "Pencil"], ["marker", "Marker"], ["eraser", "Eraser"],
  ["clear", "Clear screen"], ["zoom", "Zoom"], ["hide", "Hide screen"], ["show", "Show screen"],
  ["undo", "Undo"], ["redo", "Redo"], ["text", "Text"], ["annotations", "Annotations"],
  ["url", "URL"], ["save", "Save"], ["load", "Load"], ["timer", "Timer"],
  ["score", "Scoreboard"], ["print", "Print"],
]);
export const ultimateB2TeacherEditionDefinitions = Object.freeze([
  Object.freeze({ id: "students-book", label: "Students Book", file: "students-book" }),
  Object.freeze({ id: "workbook", label: "Workbook", file: "students-book" }),
  Object.freeze({ id: "grammar-book", label: "Grammar Book", file: "students-book" }),
  Object.freeze({ id: "extras", label: "Extras", file: "extras" }),
]);
export const ultimateB2TeacherExtrasDefinitions = Object.freeze([
  Object.freeze({ id: "progress-checks", label: "Progress Checks", file: "progress-checks", column: "left", order: 1 }),
  Object.freeze({ id: "reviews", label: "Reviews", file: "reviews", column: "left", order: 2 }),
  Object.freeze({ id: "practice", label: "Practice", file: "practice", column: "left", order: 3 }),
  Object.freeze({ id: "videos", label: "Videos", file: "videos", column: "left", order: 4 }),
  Object.freeze({ id: "extra-videos", label: "Extra Videos", file: "extra-videos", column: "left", order: 5 }),
  Object.freeze({ id: "word-lists", label: "Word Lists", file: "word-lists", column: "left", order: 6 }),
  Object.freeze({ id: "tests", label: "Tests", file: "tests", column: "left", order: 7 }),
  Object.freeze({ id: "games", label: "Games", file: "games", column: "right", order: 1 }),
  Object.freeze({ id: "grammar-reference", label: "Grammar Reference", file: "grammar-reference", column: "right", order: 2 }),
  Object.freeze({ id: "irregular-verbs", label: "Irregular Verbs", file: "irregular-verbs", column: "right", order: 3 }),
  Object.freeze({ id: "writing-bank", label: "Writing Bank", file: "writing-bank", column: "right", order: 4 }),
  Object.freeze({ id: "speaking-bank", label: "Speaking Bank", file: "speaking-bank", column: "right", order: 5 }),
  Object.freeze({ id: "extra-tasks-for-early-finishers", label: "Extra Tasks for Early Finishers", file: "extra-tasks-for-early-finishers", column: "right", order: 6 }),
  Object.freeze({ id: "worksheets-for-videos", label: "Worksheets for Videos", file: "worksheets-for-videos", column: "right", order: 7 }),
]);
const navigationFiles = Object.freeze({
  back: "back.png", check: "check.png", home: "home.png", next: "next.png", previous: "previous.png",
  close: "dialogs/exit-btn-enabled.png", minimize: "dialogs/minimize-btn-enabled.png",
  settings: "navigation/navibar-settings-active.png", video: "navigation/navibar-video-active.png",
  showText: "navigation/navibar-show-text-active.png", showTextPressed: "navigation/navibar-show-text-pressed.png",
  previousInternal: "navigation/navibar-previous-internal-active.png",
  previousInternalDisabled: "navigation/navibar-previous-internal-disabled.png",
  nextInternal: "navigation/navibar-next-internal-active.png",
  nextInternalDisabled: "navigation/navibar-next-internal-disabled.png",
});
const mediaPlayerFiles = Object.freeze({
  background: "player-bg.png", playActive: "player-play-active.png", playPressed: "player-play-pressed.png",
  pauseActive: "player-pause-active.png", pausePressed: "player-pause-pressed.png",
  stopActive: "player-stop-active.png", stopPressed: "player-stop-pressed.png",
});
const toolbarFileStem = Object.freeze({ annotations: "custom-page", load: "open" });

function assertExactKeys(value, expected, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${description} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${description} has missing or unknown fields.`);
}

function buildDefaultAssets() {
  const entries = [
    asset("background.main", "background", `${legacyRoot}/backgrounds/classroom-glacier.png`),
    asset("background.students-book-parts", "background", "src/assets/books/ultimate-b2/legacy-source/assets/books/book1/unit/2/parts/HD/parts_BG.png"),
    asset("branding.publisher-logo", "branding", `${legacyRoot}/branding/hamilton-house-logo.png`),
    asset("title.gaf", "animation", `${legacyRoot}/branding/menu-title-animation/logo.gaf`, "application/x-gaf"),
    asset("title.sd.1", "animation-atlas", `${legacyRoot}/branding/menu-title-animation/logo_SD.png`),
    asset("title.sd.2", "animation-atlas", `${legacyRoot}/branding/menu-title-animation/logo_SD_2.png`),
    asset("title.hd.1", "animation-atlas", `${legacyRoot}/branding/menu-title-animation/logo_HD.png`),
    asset("title.hd.2", "animation-atlas", `${legacyRoot}/branding/menu-title-animation/logo_HD_2.png`),
    asset("control.activity-hotspot", "control", `${legacyRoot}/controls/activity-hotspot.png`),
  ];
  for (let number = 1; number <= 10; number += 1) {
    const padded = String(number).padStart(2, "0");
    entries.push(
      asset(`unit.${number}.normal`, "unit", `${legacyRoot}/book-menu/units/unit-${padded}-normal.png`),
      asset(`unit.${number}.active`, "unit", `${legacyRoot}/book-menu/units/unit-${padded}-hover-pressed.png`),
    );
  }
  for (const { id, file } of ultimateB2TeacherEditionDefinitions) {
    entries.push(
      asset(`edition.${id}.normal`, "edition", `${legacyRoot}/book-menu/editions/${file}-normal.png`),
      asset(`edition.${id}.active`, "edition", `${legacyRoot}/book-menu/editions/${file}-hover-pressed.png`),
    );
  }
  for (const { id, file } of ultimateB2TeacherExtrasDefinitions) {
    entries.push(
      asset(`extras.${id}.normal`, "extras", `${legacyRoot}/book-menu/units-extras/${file}-normal.png`),
      asset(`extras.${id}.active`, "extras", `${legacyRoot}/book-menu/units-extras/${file}-hover-pressed.png`),
    );
  }
  for (const [id, file] of Object.entries(navigationFiles)) entries.push(asset(`navigation.${id}`, "navigation", `${legacyRoot}/icons/${file}`));
  for (const [id, file] of Object.entries(mediaPlayerFiles)) entries.push(asset(`media-player.${id}`, "media-player", `${legacyRoot}/icons/media/${file}`));
  for (const [id] of toolbarLabels) {
    const stem = toolbarFileStem[id] || id;
    entries.push(
      asset(`toolbar.${id}.normal`, "toolbar", `${legacyRoot}/icons/teacher-tools/button-${stem}.png`),
      asset(`toolbar.${id}.active`, "toolbar", `${legacyRoot}/icons/teacher-tools/button-${stem}-active.png`),
    );
  }
  entries.push(
    asset("toolbar.keyboard.normal", "toolbar", `${legacyRoot}/icons/teacher-tools/button-keyboard.png`),
    asset("toolbar.keyboard.active", "toolbar", `${legacyRoot}/icons/teacher-tools/button-keyboard-active.png`),
  );
  for (const id of ["button", "correct", "incorrect", "page-turn"]) entries.push(asset(`sound.${id}`, "sound", `${legacyRoot}/audio/ui/${id}.mp3`, "audio/mpeg"));
  for (const unit of (studentsBookRuntime.units || []).filter((candidate) => [1, 2].includes(Number(candidate.number)))) {
    for (const page of unit.pages || []) entries.push(asset(
      `page.${page.id}`,
      "page",
      page.pageImage.localHdAssetPath,
    ));
  }
  return Object.freeze(Object.fromEntries(entries.map((entry) => [entry.id, entry])));
}

export const ultimateB2TeacherAppDefaultAssets = buildDefaultAssets();
export const ultimateB2TeacherToolbarDefinitions = toolbarLabels;

export function normalizeUltimateB2TeacherAppOverrides(candidate) {
  assertExactKeys(candidate, ["schemaVersion", "packageId", "assets"], "Teacher App override manifest");
  if (candidate.schemaVersion !== ULTIMATE_B2_TEACHER_APP_SCHEMA_VERSION) throw new Error("Unsupported Teacher App authoring schema version.");
  if (candidate.packageId !== ULTIMATE_B2_TEACHER_APP_PACKAGE_ID) throw new Error("Teacher App authoring is bound to Ultimate B2 Students Book.");
  if (!candidate.assets || typeof candidate.assets !== "object" || Array.isArray(candidate.assets)) throw new Error("Teacher App asset overrides must be an object.");
  const assets = {};
  for (const [id, binding] of Object.entries(candidate.assets)) {
    const definition = ultimateB2TeacherAppDefaultAssets[id];
    if (!definition) throw new Error(`Unknown Teacher App asset binding: ${id}`);
    assertExactKeys(binding, ["repositoryPath", "mediaType", "sha256", "sizeBytes", "width", "height", "originalFilename"], `Teacher App asset override ${id}`);
    const repositoryPath = String(binding.repositoryPath || "").replaceAll("\\", "/");
    if (!/^src\/assets\/books\/ultimate-b2\/authoring\/teacher-app\/[a-f0-9]{64}\.(?:png|jpg|webp|mp3|wav|gaf)$/.test(repositoryPath)) throw new Error(`Unsafe repository path for Teacher App asset override: ${id}`);
    if (/^(?:[A-Za-z]:|\/)|(?:^|\/)\.\.(?:\/|$)/.test(repositoryPath)) throw new Error(`Absolute or traversing Teacher App asset path: ${id}`);
    const mediaType = String(binding.mediaType || "");
    const allowedTypes = definition.mediaType === "audio/mpeg" ? ["audio/mpeg", "audio/wav"]
      : definition.mediaType === "application/x-gaf" ? ["application/x-gaf"]
        : ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(mediaType)) throw new Error(`Invalid media type for Teacher App asset override: ${id}`);
    if (!/^[a-f0-9]{64}$/.test(binding.sha256)) throw new Error(`Invalid checksum for Teacher App asset override: ${id}`);
    if (!Number.isSafeInteger(binding.sizeBytes) || binding.sizeBytes <= 0) throw new Error(`Invalid byte size for Teacher App asset override: ${id}`);
    const image = mediaType.startsWith("image/");
    if (image && (![binding.width, binding.height].every((value) => Number.isSafeInteger(value) && value > 0))) throw new Error(`Invalid raster dimensions for Teacher App asset override: ${id}`);
    if (!image && (binding.width !== null || binding.height !== null)) throw new Error(`Non-raster Teacher App asset dimensions must be null: ${id}`);
    assets[id] = Object.freeze({ ...binding, repositoryPath, mediaType });
  }
  return Object.freeze({ schemaVersion: candidate.schemaVersion, packageId: candidate.packageId, assets: Object.freeze(assets) });
}

function authoredAsset(id, overrides) {
  const definition = ultimateB2TeacherAppDefaultAssets[id];
  if (!definition) throw new Error(`Unknown canonical Ultimate B2 asset binding: ${id}`);
  return Object.freeze({ ...definition, ...(overrides.assets[id] || {}) });
}

export function buildUltimateB2TeacherAppAuthoring(candidate = storedOverrides) {
  const overrides = normalizeUltimateB2TeacherAppOverrides(candidate);
  const pages = (studentsBookRuntime.units || [])
    .filter((unit) => [1, 2].includes(Number(unit.number)))
    .flatMap((unit) => (unit.pages || []).map((page) => Object.freeze({
      id: page.id,
      unitNumber: Number(unit.number),
      unitTitle: unit.title,
      partNumber: Number(page.partNumber),
      physicalPageNumber: Number(page.physicalPageNumber),
      pageNumbers: Object.freeze([...(page.pageNumbers || [page.physicalPageNumber])].map(Number)),
      printedLabel: String(page.spreadNumber || page.physicalPageNumber),
      spreadNumber: String(page.spreadNumber || page.physicalPageNumber),
      sectionTitle: page.sectionTitle,
      navigationOrder: Number(page.navigationOrder),
      logicalAssetIdentity: page.pageImage.identity,
      assetBindingId: `page.${page.id}`,
      image: authoredAsset(`page.${page.id}`, overrides),
    })));
  const pageIds = new Set(pages.map((page) => page.id));
  if (pageIds.size !== pages.length) throw new Error("Duplicate canonical Ultimate B2 page IDs.");
  const units = Array.from({ length: 10 }, (_, index) => {
    const number = index + 1;
    return Object.freeze({ id: `unit-${number}`, controlId: `unit:unit-${number}`, label: `Unit ${number}`, normal: authoredAsset(`unit.${number}.normal`, overrides), active: authoredAsset(`unit.${number}.active`, overrides) });
  });
  const editions = ultimateB2TeacherEditionDefinitions.map(({ id, label }) => Object.freeze({ id, controlId: `edition:${id}`, label, normal: authoredAsset(`edition.${id}.normal`, overrides), active: authoredAsset(`edition.${id}.active`, overrides) }));
  const extras = ultimateB2TeacherExtrasDefinitions.map(({ id, label, column, order }) => Object.freeze({ id, controlId: `extras:${id}`, label, column, order, destination: null, normal: authoredAsset(`extras.${id}.normal`, overrides), active: authoredAsset(`extras.${id}.active`, overrides) }));
  const toolbar = toolbarLabels.map(([id, label]) => Object.freeze({ id, controlId: `toolbar:${id}`, label, normal: authoredAsset(`toolbar.${id}.normal`, overrides), active: authoredAsset(`toolbar.${id}.active`, overrides), sound: authoredAsset("sound.button", overrides) }));
  const controlIds = [...units, ...editions, ...extras, ...toolbar].map((item) => item.controlId);
  if (new Set(controlIds).size !== controlIds.length) throw new Error("Duplicate canonical Ultimate B2 control IDs.");
  const assets = Object.freeze(Object.fromEntries(Object.keys(ultimateB2TeacherAppDefaultAssets).map((id) => [id, authoredAsset(id, overrides)])));
  return Object.freeze({
    schemaVersion: ULTIMATE_B2_TEACHER_APP_SCHEMA_VERSION,
    packageId: ULTIMATE_B2_TEACHER_APP_PACKAGE_ID,
    overrides,
    assets,
    pages: Object.freeze(pages),
    shell: Object.freeze({
      background: authoredAsset("background.main", overrides),
      studentsBookPartsBackground: authoredAsset("background.students-book-parts", overrides),
      publisherLogo: authoredAsset("branding.publisher-logo", overrides),
      titleAnimation: Object.freeze({ gaf: authoredAsset("title.gaf", overrides), sd: Object.freeze([authoredAsset("title.sd.1", overrides), authoredAsset("title.sd.2", overrides)]), hd: Object.freeze([authoredAsset("title.hd.1", overrides), authoredAsset("title.hd.2", overrides)]) }),
      units: Object.freeze(units), editions: Object.freeze(editions), extras: Object.freeze(extras), toolbar: Object.freeze(toolbar),
      navigation: Object.freeze(Object.fromEntries(Object.keys(navigationFiles).map((id) => [id, authoredAsset(`navigation.${id}`, overrides)]))),
      mediaPlayer: Object.freeze(Object.fromEntries(Object.keys(mediaPlayerFiles).map((id) => [id, authoredAsset(`media-player.${id}`, overrides)]))),
      activityHotspot: authoredAsset("control.activity-hotspot", overrides),
      sounds: Object.freeze({ button: authoredAsset("sound.button", overrides), correct: authoredAsset("sound.correct", overrides), incorrect: authoredAsset("sound.incorrect", overrides), pageTurn: authoredAsset("sound.page-turn", overrides) }),
    }),
  });
}

export const ultimateB2TeacherAppAuthoring = buildUltimateB2TeacherAppAuthoring();

export function getUltimateB2TeacherAppPage(pageId, model = ultimateB2TeacherAppAuthoring) {
  return model.pages.find((page) => page.id === pageId) || null;
}

export function getUltimateB2TeacherAppPageByPart(unitNumber, partNumber, model = ultimateB2TeacherAppAuthoring) {
  return model.pages.find((page) => page.unitNumber === Number(unitNumber) && page.partNumber === Number(partNumber)) || null;
}

export function ultimateB2TeacherAppAssetUrl(id, revision = "") {
  const query = new URLSearchParams({ id });
  if (revision) query.set("v", String(revision));
  return `${ULTIMATE_B2_TEACHER_APP_ASSET_ENDPOINT}?${query}`;
}

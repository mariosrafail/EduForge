import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import manifest from "../android-content-packs/ultimate-b2-students-book/manifest.json" with { type: "json" };
import catalog from "../android-content-packs/ultimate-b2-students-book/catalog.json" with { type: "json" };
import activities from "../android-content-packs/ultimate-b2-students-book/activities.json" with { type: "json" };
import assetsManifest from "../android-content-packs/ultimate-b2-students-book/assets-manifest.json" with { type: "json" };
import studentsBookRuntime from "../src/data/ultimate-b2/generated/students-book.runtime.json" with { type: "json" };
import {
  ACTIVITY_MODES,
  canOpenActivityInMode,
  getActivityModeCapabilities,
} from "../src/components/lms/activities/activityModes.js";
import { validateTeacherContentPack } from "../src/apps/android-teacher-offline/packValidation.js";
import {
  adjacentEnabledStudentsBookActivity,
  enabledStudentsBookActivitySequence,
  findStudentsBookImplementation,
} from "../src/data/ultimate-b2/studentsBookCatalog.js";
import { checkPresentationAnswers } from "../src/components/lms/activities/presentationAnswers.js";
import { buildUltimateB2TeacherSolutionPayload } from "../netlify/functions/_ultimate-b2-teacher-solutions.js";
import {
  classifyTeacherViewport,
  getTeacherDisplayScale,
  TEACHER_VIEWPORT_PROFILES,
} from "../src/apps/android-teacher-offline/viewportProfiles.js";
import {
  buildStudentsBookOverviewEntries,
  studentsBookOverviewLayout,
} from "../src/apps/android-teacher-offline/studentsBookOverviewLayout.js";
import {
  DEFAULT_TEACHER_OFFLINE_SETTINGS,
  migrateTeacherOfflineSettingsV1,
  sanitizeTeacherOfflineSettings,
  teacherMenuDelayMilliseconds,
} from "../src/apps/android-teacher-offline/teacherOfflineSettings.js";

const multipleChoiceId = "ultimate-b2-sb-u1-p2-o3";
const typedId = "ultimate-b2-sb-u2-p3-o4";
const openResponseId = "ultimate-b2-sb-u1-p1-o1";
const missingSolutionId = "ultimate-b2-sb-u1-p7-o5";
const disabledId = "ultimate-b2-sb-u1-p8-o3";
const teacherSolutionIds = activities.activities.map((activity) => activity.stableActivityId);
const teacherSolutions = {
  schemaVersion: 1,
  teacherOnly: true,
  activityIds: teacherSolutionIds,
  solutions: Object.fromEntries(teacherSolutionIds.map((activityId) => [
    activityId,
    buildUltimateB2TeacherSolutionPayload(activityId),
  ])),
};
const pack = { manifest, catalog, activities, teacherSolutions, assetsManifest };

test("Android Teacher user-facing branding is publisher-owned in both themes", async () => {
  const source = await readFile("src/apps/android-teacher-offline/TeacherOfflineSettingsDialog.jsx", "utf8");
  assert.match(source, /Hamilton House Interactive Classroom/);
  assert.match(source, /Version 0\.1\.0/);
  assert.doesNotMatch(source, /EduForge|Made by|Made with|Developed by|Created by/i);
});

test("CI builds the teacher pack before its internal verification", async () => {
  const [workflow, packageJson] = await Promise.all([
    readFile(".github/workflows/ci.yml", "utf8"),
    readFile("package.json", "utf8"),
  ]);
  const scripts = JSON.parse(packageJson).scripts;
  const teacherBuild = scripts["build:android-teacher-offline"];

  assert.doesNotMatch(workflow, /npm run verify:android-teacher-pack/);
  assert.match(workflow, /npm run build:android-offline[\s\S]*npm run verify:android-student-bundle-safety[\s\S]*npm run build:android-teacher-offline[\s\S]*npx playwright install/);
  assert.ok(teacherBuild.indexOf("build-pack.mjs") < teacherBuild.indexOf("verify-pack.mjs"));
});

test("teacher viewport profiles use available width and height rather than device identity", () => {
  assert.equal(classifyTeacherViewport({ width: 800, height: 360 }), TEACHER_VIEWPORT_PROFILES.COMPACT);
  assert.equal(classifyTeacherViewport({ width: 1024, height: 600 }), TEACHER_VIEWPORT_PROFILES.MEDIUM);
  assert.equal(classifyTeacherViewport({ width: 1180, height: 820 }), TEACHER_VIEWPORT_PROFILES.EXPANDED);
  assert.equal(classifyTeacherViewport({ width: 1280, height: 720 }), TEACHER_VIEWPORT_PROFILES.LARGE);
  assert.equal(classifyTeacherViewport({ width: 1920, height: 1080 }), TEACHER_VIEWPORT_PROFILES.EXTRA_LARGE);
  assert.equal(classifyTeacherViewport({ width: 3840, height: 2160 }), TEACHER_VIEWPORT_PROFILES.EXTRA_LARGE);
});

test("Teacher automatic display scale uses the 1920x1080 baseline and clamps from 1 to 2", () => {
  assert.equal(getTeacherDisplayScale(800, 360), 1);
  assert.equal(getTeacherDisplayScale(1280, 720), 1);
  assert.equal(getTeacherDisplayScale(1920, 1080), 1);
  assert.ok(Math.abs(getTeacherDisplayScale(2560, 1440) - 4 / 3) < 0.0001);
  assert.equal(getTeacherDisplayScale(3840, 2160), 2);
  assert.equal(getTeacherDisplayScale(7680, 4320), 2);
  assert.equal(getTeacherDisplayScale(3840, 1080), 1);
  assert.equal(getTeacherDisplayScale(0, 0), 1);
});

test("Teacher large-display scaling uses layout dimensions and multiplies Interface Size", async () => {
  const [app, rootCss, scaleCss] = await Promise.all([
    readFile("src/apps/android-teacher-offline/TeacherOfflineApp.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherOfflineRoot.css", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherDisplayScale.css", "utf8"),
  ]);
  assert.match(app, /viewport\.displayScale \* userInterfaceScale/);
  assert.match(app, /"--teacher-display-scale": viewport\.displayScale/);
  assert.match(app, /"--teacher-ui-scale": effectiveUiScale/);
  assert.match(rootCss, /teacherDisplayScale\.css/);
  assert.match(scaleCss, /\.legacy-home-launcher[\s\S]*\.teacher-offline-unit-overview-screen[\s\S]*\.teacher-offline-pages-viewer[\s\S]*\.classroom-teaching-toolbar[\s\S]*\.legacy-settings-dialog/);
  assert.doesNotMatch(scaleCss, /\bzoom\s*:/i);
  assert.doesNotMatch(scaleCss, /\.teacher-offline-settings-surface\s*\{[^}]*transform\s*:/i);
});

test("Students Book overview groups every real Unit 1 and Unit 2 page exactly once", () => {
  const unit1 = studentsBookRuntime.units.find((unit) => unit.number === 1);
  const unit2 = studentsBookRuntime.units.find((unit) => unit.number === 2);
  const unit1Entries = buildStudentsBookOverviewEntries(unit1);
  const unit2Entries = buildStudentsBookOverviewEntries(unit2);

  assert.equal(unit1.pages.length, 10);
  assert.equal(unit1Entries.length, 9);
  assert.deepEqual(unit1Entries.flatMap((entry) => entry.pageIds), unit1.pages.map((page) => page.id));
  assert.deepEqual(unit1Entries.find((entry) => entry.label === "Practice 1").pageIds, ["ub2-sb-unit-1-part-9", "ub2-sb-unit-1-part-10"]);

  assert.equal(unit2.pages.length, 12);
  assert.equal(unit2Entries.length, 10);
  assert.deepEqual(unit2Entries.flatMap((entry) => entry.pageIds), unit2.pages.map((page) => page.id));
  assert.deepEqual(unit2Entries.find((entry) => entry.label === "Practice 2").pageIds, ["practice-31", "practice-32"]);
  assert.deepEqual(unit2Entries.find((entry) => entry.label === "Progress check 1").pageIds, ["progress-check-33", "progress-check-34"]);
  assert.deepEqual(studentsBookOverviewLayout[2][0], { label: null, pageLabel: "pg 19", pageIds: ["reading-19"], row: 1 });

  assert.throws(
    () => buildStudentsBookOverviewEntries({ ...unit1, pages: unit1.pages.slice(1) }),
    /Invalid Unit 1 overview layout/,
  );
});

test("teacher settings are bounded, category-specific, and map menu delay to 1-10 seconds", () => {
  const settings = sanitizeTeacherOfflineSettings({
    audio: { buttonEnabled: false, buttonVolume: 140, navigationVolume: -8, toolbarVolume: 61 },
    content: { showNavbarLeft: false, showNavbarRight: false, menuAutoHide: true, menuDelay: 75 },
    graphics: { interfaceScale: 150, colourIntensity: 5, effectsEnabled: false },
  });
  assert.deepEqual(settings.audio, {
    buttonEnabled: false,
    buttonVolume: 100,
    navigationEnabled: true,
    navigationVolume: 0,
    toolbarEnabled: true,
    toolbarVolume: 61,
  });
  assert.deepEqual(settings.content, { showNavbarLeft: false, showNavbarRight: false, menuAutoHide: true, menuDelay: 75 });
  assert.deepEqual(settings.graphics, {
    appearanceMode: "modern",
    motionEnabled: true,
    interfaceScale: 110,
    colourIntensity: 40,
    effectsEnabled: false,
  });
  assert.equal(teacherMenuDelayMilliseconds(0), 1000);
  assert.equal(teacherMenuDelayMilliseconds(100), 10000);
});

test("teacher settings v1 migration preserves existing values and adds modern motion defaults", () => {
  const migrated = migrateTeacherOfflineSettingsV1({
    audio: { buttonEnabled: false, buttonVolume: 17, navigationEnabled: false, navigationVolume: 32, toolbarEnabled: true, toolbarVolume: 49 },
    content: { showNavbarLeft: false, showNavbarRight: true, menuAutoHide: true, menuDelay: 81 },
    graphics: { interfaceScale: 106, colourIntensity: 72, effectsEnabled: false },
  });
  assert.deepEqual(migrated.audio, { buttonEnabled: false, buttonVolume: 17, navigationEnabled: false, navigationVolume: 32, toolbarEnabled: true, toolbarVolume: 49 });
  assert.deepEqual(migrated.content, { showNavbarLeft: false, showNavbarRight: true, menuAutoHide: true, menuDelay: 81 });
  assert.deepEqual(migrated.graphics, { appearanceMode: "modern", motionEnabled: true, interfaceScale: 106, colourIntensity: 72, effectsEnabled: false });
  assert.equal(DEFAULT_TEACHER_OFFLINE_SETTINGS.graphics.appearanceMode, "modern");
  assert.equal(DEFAULT_TEACHER_OFFLINE_SETTINGS.graphics.motionEnabled, true);
  assert.equal(sanitizeTeacherOfflineSettings({ graphics: { appearanceMode: "invalid", motionEnabled: "yes" } }).graphics.appearanceMode, "modern");
});

test("generic Teacher shell identity is not B2-only while book identity remains specific", async () => {
  const [settingsDialog, entry, library, book] = await Promise.all([
    readFile("src/apps/android-teacher-offline/TeacherOfflineSettingsDialog.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherOfflineEntry.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflineLibrary.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflineBook.jsx", "utf8"),
  ]);
  assert.match(settingsDialog, /Hamilton House Interactive Classroom/);
  assert.match(settingsDialog, /Interactive Classroom/);
  assert.doesNotMatch(settingsDialog, /Ultimate English B2 interactive classroom content/);
  assert.match(entry, /Hamilton House Interactive Classroom/);
  assert.match(library, /Ultimate English B2/);
  assert.match(book, /Ultimate English B2/);
});

test("modern Teacher unit selectors use shared titles and touch-safe interaction CSS", async () => {
  const [component, metadata, modernCss] = await Promise.all([
    readFile("src/apps/android-teacher-offline/TeacherUnitSwitch.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherOfflineUnitMetadata.js", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherOfflineModern.css", "utf8"),
  ]);
  assert.match(component, /teacherAvailableStudentsBookUnits\.map/);
  assert.match(component, /teacher-unit-switch-badge/);
  assert.match(component, /teacher-unit-switch-title/);
  assert.match(component, /aria-pressed=\{selected\}/);
  assert.match(metadata, /Lights, Camera, Action!/);
  assert.match(metadata, /Journeys of Discovery/);
  assert.match(modernCss, /\.teacher-unit-switch button:not\(:disabled\):active/);
  assert.match(modernCss, /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.teacher-unit-switch button:not\(:disabled\):hover/);
  assert.doesNotMatch(modernCss.replace(/@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\n\}/, ""), /\.teacher-unit-switch[^\n]*:hover/);
  assert.match(modernCss, /\.teacher-unit-switch button::before[\s\S]*?border-radius: 13px/);
});

test("Unit Overview uses installed-unit side arrows instead of its top-left switcher", async () => {
  const [book, pages, overview, overviewCss, modernCss] = await Promise.all([
    readFile("src/apps/android-teacher-offline/TeacherOfflineBook.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflinePages.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflineUnitOverview.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherOfflineUnitOverview.css", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherOfflineModern.css", "utf8"),
  ]);
  assert.match(book, /availableUnitNumbers = \(pageUnits \|\| \[\]\)/);
  assert.match(book, /availableUnitNumbers=\{availableUnitNumbers\}/);
  assert.match(pages, /availableUnitNumbers=\{availableUnitNumbers\}/);
  assert.match(overview, /orderedAvailableUnits = \[\.\.\.availableUnitNumbers\]\.sort/);
  assert.match(overview, /aria-label="Previous unit"/);
  assert.match(overview, /aria-label="Next unit"/);
  assert.match(overview, /data-unit-target=\{previousUnit\}/);
  assert.match(overview, /data-unit-target=\{nextUnit\}/);
  assert.doesNotMatch(overview, /TeacherUnitSwitch|legacy-overview-unit-switcher/);
  assert.doesNotMatch(overview, /LegacyClassroomIcon name="(?:previous|next)"/);
  assert.doesNotMatch(overview, /unitNumber (?:>|<) [12]/);
  assert.match(overview, /ClassroomToolOverlay[\s\S]*ClassroomToolbar/);
  assert.match(overviewCss, /\.teacher-unit-side-navigation[\s\S]*width: 60px;[\s\S]*height: 60px/);
  assert.match(overviewCss, /\.teacher-unit-side-navigation \{ width: 44px; height: 44px; min-height: 44px/);
  assert.match(overviewCss, /\.teacher-unit-side-navigation \{ width: 72px; height: 72px; min-height: 72px/);
  assert.match(overviewCss, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*\.teacher-unit-side-navigation:hover/);
  assert.match(modernCss, /\.teacher-unit-side-navigation[\s\S]*linear-gradient\(145deg, #16a8bd, #78338f\)/);
});

test("teacher-presentation-offline is a distinct centralized non-submitting mode", () => {
  assert.equal(ACTIVITY_MODES.TEACHER_PRESENTATION_OFFLINE, "teacher-presentation-offline");
  const capabilities = getActivityModeCapabilities(ACTIVITY_MODES.TEACHER_PRESENTATION_OFFLINE);
  assert.deepEqual(capabilities, {
    canEditAnswers: true,
    canSubmitStudentWork: false,
    canRequestSolutions: false,
    canUseOfflineSolutions: true,
    canRevealSolutions: true,
    canCheckLocally: true,
    canResetActivity: true,
    isReadOnly: false,
    isPresentation: true,
    isOffline: true,
    showLargeControls: true,
    persistAttempt: false,
  });
  assert.equal(getActivityModeCapabilities(ACTIVITY_MODES.STUDENT).canUseOfflineSolutions, false);
  assert.equal(getActivityModeCapabilities(ACTIVITY_MODES.TEACHER_PRESENTATION).canUseOfflineSolutions, false);
});

test("offline teacher pack has exact enabled/disabled counts and enabled-only navigation", () => {
  const sequence = enabledStudentsBookActivitySequence();
  assert.equal(manifest.activityCountsByUnit["1"], 38);
  assert.equal(manifest.activityCountsByUnit["2"], 40);
  assert.equal(manifest.enabledActivityCount, 78);
  assert.equal(manifest.disabledActivityCount, 12);
  assert.equal(sequence.length, 78);
  assert.equal(new Set(sequence.map((activity) => activity.stableActivityId)).size, 78);
  assert.deepEqual(
    activities.activities.map((activity) => activity.stableActivityId),
    sequence.map((activity) => activity.stableActivityId),
  );
  assert.equal(teacherSolutions.solutions[disabledId], undefined);
  assert.equal(canOpenActivityInMode(findStudentsBookImplementation(disabledId), ACTIVITY_MODES.TEACHER_PRESENTATION_OFFLINE), false);
});

test("offline teacher solutions preserve verified, model-response, and missing-evidence states", () => {
  const multipleChoice = teacherSolutions.solutions[multipleChoiceId];
  const multipleQuestion = multipleChoice.questions[`${multipleChoiceId}-q1`];
  assert.deepEqual(multipleQuestion.correctOptionIds, [`${multipleChoiceId}-q1-o2`]);

  const typed = teacherSolutions.solutions[typedId];
  const typedQuestion = typed.questions[`${typedId}-q8`];
  assert.deepEqual(typedQuestion.acceptedAnswers, ["out/off", "out", "off"]);
  assert.equal(checkPresentationAnswers({ [typedQuestion.questionId]: " off. " }, typed)[typedQuestion.questionId], "correct");
  assert.equal(teacherSolutions.solutions[openResponseId].solutionAvailability, "model-response");
  assert.equal(Object.keys(teacherSolutions.solutions[openResponseId].questions).length, 3);
  assert.equal(teacherSolutions.solutions[missingSolutionId].solutionAvailability, "missing");
});

test("pack runtime validation rejects corrupted semantic checksums safely", async () => {
  assert.deepEqual(await validateTeacherContentPack(pack), { valid: true, reason: "" });
  const corrupt = structuredClone(pack);
  corrupt.activities.activities[0].title = "corrupted";
  const result = await validateTeacherContentPack(corrupt);
  assert.equal(result.valid, false);
  assert.match(result.reason, /Integrity check failed/);
});

test("previous and next traverse exactly the 78 enabled activities", () => {
  const sequence = enabledStudentsBookActivitySequence();
  for (let index = 0; index < sequence.length; index += 1) {
    const current = sequence[index];
    assert.equal(
      adjacentEnabledStudentsBookActivity(current.stableActivityId, -1)?.stableActivityId || null,
      sequence[index - 1]?.stableActivityId || null,
    );
    assert.equal(
      adjacentEnabledStudentsBookActivity(current.stableActivityId, 1)?.stableActivityId || null,
      sequence[index + 1]?.stableActivityId || null,
    );
  }
});

test("teacher app uses bounded page/media state and no student persistence path", async () => {
  const [app, pages, overview, presentation, media, library, unitMetadata, toolbar, overlay, toolsContext, renderer, provider, storage, entry, networkGuard] = await Promise.all([
    readFile("src/apps/android-teacher-offline/TeacherOfflineApp.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflinePages.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflineUnitOverview.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflinePresentation.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflineMedia.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflineLibrary.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherOfflineUnitMetadata.js", "utf8"),
    readFile("src/apps/android-teacher-offline/ClassroomToolbar.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/ClassroomToolOverlay.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/ClassroomToolsContext.jsx", "utf8"),
    readFile("src/components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/generatedPackProvider.js", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherOfflineStorage.js", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherOfflineEntry.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherOfflineNetworkGuard.js", "utf8"),
  ]);
  assert.match(presentation, /TEACHER_PRESENTATION_OFFLINE/);
  assert.match(presentation, /NormalizedStudentsBookActivity/);
  assert.match(pages, /<img[\s\S]*key=\{page\.id\}/);
  assert.match(pages, /TeacherOfflineUnitOverview/);
  assert.match(overview, /teacher-unit-page-card/);
  assert.match(overview, /buildStudentsBookOverviewEntries/);
  assert.match(overview, /onClick=\{\(\) => onSelectPage\(entry\.pageIds\[0\]\)\}/);
  assert.doesNotMatch(overview, /activities<\/small>/);
  assert.match(pages, /onSelectPage\(""\)/);
  assert.match(pages, /legacy-page-heading/);
  assert.match(pages, /legacy-page-navigation/);
  assert.match(pages, /ClassroomToolOverlay/);
  assert.match(pages, /ClassroomToolbar/);
  assert.doesNotMatch(pages, /requestFullscreen|Fit page|Fit width|Reset zoom/);
  assert.equal((pages.match(/<img\b/g) || []).length, 1);
  assert.equal((overview.match(/<img\b/g) || []).length, 1);
  assert.doesNotMatch(pages, /<aside/);
  assert.match(presentation, /ClassroomToolOverlay[\s\S]*ClassroomToolbar/);
  assert.match(media, /ClassroomToolOverlay[\s\S]*ClassroomToolbar/);
  assert.match(app, /ClassroomToolsProvider/);
  for (const label of ["Pen tool", "Zoom region", "Cover area tool", "Spotlight reveal tool", "Open timer", "Open scoreboard", "Print current view", "Clear classroom markup", "Eraser tool", "Text tool", "Undo drawing", "Redo drawing", "Show on-screen keyboard"]) {
    assert.match(toolbar, new RegExp(label));
  }
  assert.doesNotMatch(toolbar, /More classroom tools|Show classroom tools|menuAutoHide|menuDelay|viewControls|Fullscreen/);
  assert.match(toolbar, /PEN MODE/);
  assert.match(toolbar, /COVER MODE/);
  assert.match(toolbar, /SPOTLIGHT MODE/);
  assert.match(toolbar, /ZOOM MODE/);
  assert.match(overlay, /setPointerCapture[\s\S]*type: "stroke"/);
  assert.match(overlay, /addCover[\s\S]*setSpotlight[\s\S]*setRegionZoom/);
  assert.match(overlay, /Delete selected cover/);
  assert.match(toolsContext, /interactive-classroom:annotations:v1/);
  assert.match(toolsContext, /past:[\s\S]*present:[\s\S]*future:/);
  assert.match(toolsContext, /drawings:[\s\S]*overlays:/);
  assert.match(toolsContext, /clearCovers[\s\S]*setSpotlight[\s\S]*clearAllMarkup/);
  assert.match(unitMetadata, /length: 8[\s\S]*number: index \+ 3/);
  assert.match(library, /\["Workbook", "Workbook content not installed"\]/);
  assert.match(library, /\["Grammar Book", "Grammar Book content not installed"\]/);
  assert.match(library, /\["Extras", "Extras content not installed"\]/);
  assert.match(library, /legacy-home-lock[\s\S]*Locked/);
  assert.match(library, /disabled=\{!unit\.available\}/);
  assert.match(library, /onClick=\{unit\.available \?/);
  assert.doesNotMatch(library, /homeTools|legacy-home-classroom-toolbar|Minimize|MonitorPlay|Interactive Classroom[^<]*Offline/);
  assert.match(library, /legacy-home-settings-button[\s\S]*onOpenSettings/);
  assert.match(library, /legacy-home-close-button[\s\S]*onCloseApplication/);
  assert.match(app, /onOpenSettings=\{\(\) => setSettingsOpen\(true\)\}/);
  assert.match(app, /onCloseApplication=\{closeApplication\}/);
  assert.match(app, /Capacitor\.isNativePlatform\(\)[\s\S]*App\.exitApp\(\)/);
  assert.match(app, /navigation\.view === "book"[\s\S]*legacy-classroom-settings-trigger/);
  assert.match(renderer, /mediaElement\.pause\(\)[\s\S]*removeAttribute\("src"\)[\s\S]*mediaElement\.load\(\)/);
  assert.match(renderer, /mediaRef\.current\?\.pause/);
  assert.match(renderer, /visibilitychange/);
  assert.match(renderer, /preload="metadata"/);
  assert.match(renderer, /onError=\{\(\) => setMediaError/);
  assert.match(app, /teacherContentPackProvider\.load/);
  assert.match(app, /App\.addListener\("backButton"/);
  assert.match(app, /current\.view === "book"[\s\S]*replaceState\(next, "", "#library"\)/);
  assert.match(app, /current\.view === "library"[\s\S]*App\.exitApp/);
  assert.match(app, /replace: true/);
  assert.doesNotMatch(app, /onSubmit|markAndroidOfflinePageComplete|saveAndroidOfflineAnswer/);
  assert.doesNotMatch(storage, /answer|solution|submission|grade/i);
  assert.match(provider, /teacher-solutions\.json/);
  assert.match(entry, /visibilitychange/);
  assert.match(entry, /pagehide/);
  assert.match(networkGuard, /\["WebSocket", "EventSource"\]/);
});

test("teacher Android shell is landscape, immersive, offline-only, and safely labeled", async () => {
  const [manifest, activity, gradle, buildScript, apkVerifier] = await Promise.all([
    readFile("android/app/src/main/AndroidManifest.xml", "utf8"),
    readFile("android/app/src/main/java/com/eduforge/offlinebooks/MainActivity.java", "utf8"),
    readFile("android/app/build.gradle", "utf8"),
    readFile("scripts/android-teacher/build-apk.mjs", "utf8"),
    readFile("scripts/android-teacher/verify-apk.mjs", "utf8"),
  ]);
  assert.match(manifest, /android:screenOrientation="landscape"/);
  assert.doesNotMatch(manifest, /android\.permission\.INTERNET/);
  assert.match(activity, /BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/);
  assert.match(activity, /onPause\(\)[\s\S]*pauseWebMedia/);
  assert.doesNotMatch(activity, /FLAG_LAYOUT_NO_LIMITS/);
  assert.match(gradle, /teacherPresentation[\s\S]*Hamilton House Interactive Classroom/);
  assert.match(buildScript, /build:android-teacher-offline[\s\S]*cap[\s\S]*run-gradle\.mjs[\s\S]*verify:android-teacher-apk/);
  assert.match(apkVerifier, /applicationId[\s\S]*applicationLabel[\s\S]*minSdk[\s\S]*targetSdk/);
});

test("teacher media mappings are checkout-local and never use raw publisher application paths", async () => {
  const [sources, runtimeAssets] = await Promise.all([
    readFile("scripts/android-teacher/pack-asset-sources.mjs", "utf8"),
    readFile("src/data/ultimate-b2/ultimateB2MediaAssets.teacher-offline.js", "utf8"),
  ]);
  assert.doesNotMatch(sources, /Ultimate English B2\.app|Contents[\\/]Resources/);
  assert.doesNotMatch(runtimeAssets, /Ultimate English B2\.app|Contents[\\/]Resources/);
  assert.match(sources, /teacher-offline-media/);
  assert.match(runtimeAssets, /teacher-offline-media/);
});

test("web and student build aliases cannot import the offline solution file", async () => {
  const [viteConfig, emptyProvider, webService] = await Promise.all([
    readFile("vite.config.js", "utf8"),
    readFile("src/apps/android-teacher-offline/noOfflineSolutions.js", "utf8"),
    readFile("src/services/bookContentApi.js", "utf8"),
  ]);
  assert.match(viteConfig, /isAndroidTeacherOffline[\s\S]*generatedPackProvider\.js[\s\S]*noOfflineSolutions\.js/);
  assert.doesNotMatch(emptyProvider, /teacher-solutions|acceptedAnswers|correctOptionIds/);
  assert.match(webService, /teacher-activity-solutions/);
  assert.doesNotMatch(webService, /android-content-packs|teacher-solutions\.json/);
});

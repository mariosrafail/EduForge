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
  TEACHER_VIEWPORT_PROFILES,
} from "../src/apps/android-teacher-offline/viewportProfiles.js";
import {
  buildStudentsBookOverviewEntries,
  studentsBookOverviewLayout,
} from "../src/apps/android-teacher-offline/studentsBookOverviewLayout.js";

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
  assert.equal(manifest.activityCountsByUnit["1"], 37);
  assert.equal(manifest.activityCountsByUnit["2"], 40);
  assert.equal(manifest.enabledActivityCount, 77);
  assert.equal(manifest.disabledActivityCount, 12);
  assert.equal(sequence.length, 77);
  assert.equal(new Set(sequence.map((activity) => activity.stableActivityId)).size, 77);
  assert.deepEqual(
    activities.activities.map((activity) => activity.stableActivityId),
    sequence.map((activity) => activity.stableActivityId),
  );
  assert.equal(teacherSolutions.solutions[disabledId], undefined);
  assert.equal(canOpenActivityInMode(findStudentsBookImplementation(disabledId), ACTIVITY_MODES.TEACHER_PRESENTATION_OFFLINE), false);
});

test("offline teacher solutions preserve verified, open-response, and missing-evidence states", () => {
  const multipleChoice = teacherSolutions.solutions[multipleChoiceId];
  const multipleQuestion = multipleChoice.questions[`${multipleChoiceId}-q1`];
  assert.deepEqual(multipleQuestion.correctOptionIds, [`${multipleChoiceId}-q1-o2`]);

  const typed = teacherSolutions.solutions[typedId];
  const typedQuestion = typed.questions[`${typedId}-q8`];
  assert.deepEqual(typedQuestion.acceptedAnswers, ["out/off", "out", "off"]);
  assert.equal(checkPresentationAnswers({ [typedQuestion.questionId]: " off. " }, typed)[typedQuestion.questionId], "correct");
  assert.equal(teacherSolutions.solutions[openResponseId].solutionAvailability, "open-response");
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

test("previous and next traverse exactly the 77 enabled activities", () => {
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
  const [app, pages, overview, presentation, media, library, toolbar, overlay, toolsContext, renderer, provider, storage, entry, networkGuard] = await Promise.all([
    readFile("src/apps/android-teacher-offline/TeacherOfflineApp.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflinePages.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflineUnitOverview.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflinePresentation.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflineMedia.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflineLibrary.jsx", "utf8"),
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
  assert.match(pages, /requestFullscreen/);
  assert.equal((pages.match(/<img\b/g) || []).length, 1);
  assert.equal((overview.match(/<img\b/g) || []).length, 1);
  assert.doesNotMatch(pages, /<aside/);
  assert.match(presentation, /ClassroomToolOverlay[\s\S]*ClassroomToolbar/);
  assert.match(media, /ClassroomToolOverlay[\s\S]*ClassroomToolbar/);
  assert.match(app, /ClassroomToolsProvider/);
  for (const label of ["Pen tool", "Eraser tool", "Text tool", "Undo annotation", "Redo annotation", "Spotlight reveal tool", "Cover area tool", "Open timer", "Open scoreboard", "Print current view", "Show on-screen keyboard"]) {
    assert.match(toolbar, new RegExp(label));
  }
  assert.match(overlay, /setPointerCapture[\s\S]*type: "stroke"/);
  assert.match(overlay, /type === "spotlight"[\s\S]*type === "cover"/);
  assert.match(toolsContext, /interactive-classroom:annotations:v1/);
  assert.match(toolsContext, /past:[\s\S]*present:[\s\S]*future:/);
  assert.match(library, /number: 10/);
  assert.match(library, /\["Workbook", "Workbook content not installed"\]/);
  assert.match(library, /\["Grammar Book", "Grammar Book content not installed"\]/);
  assert.match(library, /\["Extras", "Extras content not installed"\]/);
  assert.match(library, /legacy-home-lock[\s\S]*Locked/);
  assert.match(library, /disabled=\{!unit\.available\}/);
  assert.match(library, /onClick=\{unit\.available \?/);
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

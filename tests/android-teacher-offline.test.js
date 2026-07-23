import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import manifest from "../android-content-packs/ultimate-b2-students-book/manifest.json" with { type: "json" };
import catalog from "../android-content-packs/ultimate-b2-students-book/catalog.json" with { type: "json" };
import activities from "../android-content-packs/ultimate-b2-students-book/activities.json" with { type: "json" };
import assetsManifest from "../android-content-packs/ultimate-b2-students-book/assets-manifest.json" with { type: "json" };
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
  const [app, pages, presentation, renderer, provider, storage] = await Promise.all([
    readFile("src/apps/android-teacher-offline/TeacherOfflineApp.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflinePages.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflinePresentation.jsx", "utf8"),
    readFile("src/components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/generatedPackProvider.js", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherOfflineStorage.js", "utf8"),
  ]);
  assert.match(presentation, /TEACHER_PRESENTATION_OFFLINE/);
  assert.match(presentation, /NormalizedStudentsBookActivity/);
  assert.match(pages, /<img[\s\S]*key=\{page\.id\}/);
  assert.equal((pages.match(/<img\b/g) || []).length, 1);
  assert.match(renderer, /mediaElement\.pause\(\)[\s\S]*removeAttribute\("src"\)[\s\S]*mediaElement\.load\(\)/);
  assert.match(app, /teacherContentPackProvider\.load/);
  assert.doesNotMatch(app, /onSubmit|markAndroidOfflinePageComplete|saveAndroidOfflineAnswer/);
  assert.doesNotMatch(storage, /answer|solution|submission|grade/i);
  assert.match(provider, /teacher-solutions\.json/);
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

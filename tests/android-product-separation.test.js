import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Android products keep one compatibility application id with distinct labels and artifacts", async () => {
  const [capacitor, gradle, packageJson, studentVerifier, teacherVerifier] = await Promise.all([
    readFile("capacitor.config.ts", "utf8"),
    readFile("android/app/build.gradle", "utf8"),
    readFile("package.json", "utf8"),
    readFile("scripts/android/verify-student-apk.mjs", "utf8"),
    readFile("scripts/android-teacher/verify-apk.mjs", "utf8"),
  ]);
  for (const source of [capacitor, gradle, studentVerifier, teacherVerifier]) assert.match(source, /com\.eduforge\.offlinebooks/);
  assert.match(capacitor, /Hamilton House LMS Teacher/);
  assert.match(capacitor, /Hamilton House LMS Student/);
  assert.match(gradle, /Hamilton House LMS Teacher/);
  assert.match(gradle, /Hamilton House LMS Student/);
  assert.match(packageJson, /verify:android-student-apk/);
  assert.match(studentVerifier, /hamilton-house-lms-student-debug\.apk/);
  assert.match(teacherVerifier, /hamilton-house-lms-teacher-debug\.apk/);
  assert.match(studentVerifier, /inspectAndroidApk\(apkPath\)/);
  assert.match(teacherVerifier, /inspectAndroidApk\(apkPath\)/);
  assert.doesNotMatch(studentVerifier, /output-metadata\.json|merged_manifest/);
  assert.doesNotMatch(teacherVerifier, /output-metadata\.json|merged_manifest/);
});

test("student Android entry graph substitutes authoring and teacher-answer UI", async () => {
  const [vite, viewer, studentAnswerUi, safety] = await Promise.all([
    readFile("vite.config.js", "utf8"),
    readFile("src/apps/android-offline/AndroidBookViewer.jsx", "utf8"),
    readFile("src/apps/android-offline/NoTeacherAnswerUi.jsx", "utf8"),
    readFile("scripts/android/verify-student-bundle.mjs", "utf8"),
  ]);
  assert.match(vite, /virtual:teacher-answer-ui/);
  assert.match(vite, /NoTeacherAnswerUi\.jsx/);
  assert.match(vite, /OfflineDisabledBookTools\.jsx/);
  assert.doesNotMatch(viewer, /ClassroomToolbar|teacherContentPackProvider|generatedPackProvider/);
  assert.doesNotMatch(studentAnswerUi, /Show all answers|Publisher answer|acceptedAnswers/);
  assert.match(safety, /teacher presentation toolbar/);
  assert.match(safety, /teacher content pack/);
  assert.match(safety, /teacher answer controls/);
});

test("reading hotspots are transparent by default and authoring remains explicitly visible", async () => {
  const [activities, recovered, books, teacher] = await Promise.all([
    readFile("src/styles/activities.css", "utf8"),
    readFile("src/styles/ultimate-b2-recovered-activities.css", "utf8"),
    readFile("src/styles/books.css", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherOfflinePageViewer.css", "utf8"),
  ]);
  assert.match(activities, /\.reading-spread-hotspot \{[\s\S]*background: transparent;[\s\S]*border: 2px solid transparent;/);
  assert.match(activities, /\.reading-spread-hotspot\.assigned/);
  assert.match(recovered, /\.authored-book-page-hotspots \.reading-spread-hotspot \{[\s\S]*background: transparent/);
  assert.match(books, /\.editable-hotspot-layer\.editing \.editable-hotspot-box \{[\s\S]*background: rgba\(23, 92, 211, 0\.17\)/);
  assert.match(teacher, /\.teacher-offline-pages-viewer \.teacher-offline-page-hotspot \{[\s\S]*border: 2px solid transparent;[\s\S]*background-color: transparent/);
});

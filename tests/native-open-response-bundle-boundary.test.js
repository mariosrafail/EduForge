import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public native Open Response renderer has no Teacher schema or answer dependency", async () => {
  const source = await readFile(new URL("../src/components/native-open-response/NativeOpenResponseSurface.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /nativeActivityTeacher|TeacherSurface|modelAnswers|modelAnswer|revealText|teacherDocument/);
  assert.match(source, /NativeOpenResponseSurface/);
});

test("native Teacher reveal is an explicit wrapper around the public renderer", async () => {
  const source = await readFile(new URL("../src/components/native-open-response/NativeOpenResponseTeacherSurface.jsx", import.meta.url), "utf8");
  assert.match(source, /NativeOpenResponseSurface/);
  assert.match(source, /fitNativeOpenResponseRuntimeAnswer/);
  assert.match(source, /\.filter\(\(text\) => String\(text\)\.trim\(\)\)\.join\(" \/ "\)/);
  assert.doesNotMatch(source, /Model answer 1|Model answer 2|native-or-answer-variant/);
  assert.doesNotMatch(source, /getBoundingClientRect|measureText|canvas/);
  const runtimeFit = await readFile(new URL("../src/components/native-open-response/nativeOpenResponseRuntimeFit.js", import.meta.url), "utf8");
  assert.match(runtimeFit, /autoFitNativeOpenResponseAnswer/);
  assert.match(runtimeFit, /measureText/);
});

test("interactive Student preview is public-only local state with no persistence dependency", async () => {
  const source = await readFile(new URL("../src/components/native-open-response/NativeOpenResponseStudentSurface.jsx", import.meta.url), "utf8");
  assert.match(source, /useState/);
  assert.match(source, /NativeOpenResponseSurface/);
  assert.match(source, /<textarea/);
  assert.match(source, /fitNativeOpenResponseRuntimeAnswer/);
  assert.doesNotMatch(source, /Teacher|teacherDocument|modelAnswers|saveNativeActivityPair|getBuilderContent|fetch\(/);
});

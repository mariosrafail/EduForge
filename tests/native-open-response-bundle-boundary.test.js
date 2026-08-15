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
  assert.match(source, /autoFitNativeOpenResponseAnswer/);
  assert.doesNotMatch(source, /getBoundingClientRect|measureText|canvas/);
});

test("interactive Student preview is public-only local state with no persistence dependency", async () => {
  const source = await readFile(new URL("../src/components/native-open-response/NativeOpenResponseStudentSurface.jsx", import.meta.url), "utf8");
  assert.match(source, /useState/);
  assert.match(source, /NativeOpenResponseSurface/);
  assert.match(source, /<textarea/);
  assert.doesNotMatch(source, /Teacher|teacherDocument|modelAnswers|saveNativeActivityPair|getBuilderContent|fetch\(/);
});

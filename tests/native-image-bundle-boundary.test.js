import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public Native Image surface depends only on the public document and managed preview URL", async () => {
  const source = await readFile(new URL("../src/components/native-image/NativeImageSurface.jsx", import.meta.url), "utf8");
  assert.match(source, /document\.parts\[0\]\.interaction/);
  assert.match(source, /assetUrl/);
  assert.doesNotMatch(source, /Teacher|teacherDocument|solution|modelAnswer|fetch\(/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public Native Image surface depends only on the public document and managed preview URL", async () => {
  const source = await readFile(new URL("../src/components/native-image/NativeImageSurface.jsx", import.meta.url), "utf8");
  assert.match(source, /document\.parts\[0\]\.interaction/);
  assert.match(source, /assetUrl/);
  assert.doesNotMatch(source, /Teacher|teacherDocument|solution|modelAnswer|fetch\(/);
});

test("Image Builder keeps learner content and per-image Alt text without generic instruction authoring", async () => {
  const [editor, surface, styles] = await Promise.all([
    readFile(new URL("../src/apps/book-builder/hosted/NativeImageEditor.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/native-image/NativeImageSurface.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/native-image/nativeImage.css", import.meta.url), "utf8"),
  ]);
  assert.match(editor, /label="Activity title"/);
  assert.match(editor, /label="Content"/);
  assert.match(editor, /interaction\.contentText/);
  assert.doesNotMatch(editor, /label="Visible instruction"/);
  assert.match(editor, /label="Alt text"/);
  assert.match(editor, /delete next\.parts\[0\]\.interaction\.contentText/);
  assert.match(surface, /native-image-content-text/);
  assert.doesNotMatch(surface, /dangerouslySetInnerHTML/);
  assert.match(styles, /white-space:\s*pre-wrap/);
  assert.match(styles, /width:\s*min\(100%, 72ch\)/);
});

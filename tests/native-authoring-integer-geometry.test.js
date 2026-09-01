import assert from "node:assert/strict";
import test from "node:test";

import { saveNativeActivityPair } from "../src/apps/book-builder/hosted/builderNativeActivityApi.js";
import { normalizeNativeActivityAuthoringVisualValues, projectNativeActivityPublicForAuthoring } from "../src/apps/book-builder/hosted/nativeActivityAuthoringProjection.js";

function historicalDraft() {
  return {
    metadata: { visibleInstructionText: "Published instruction" },
    parts: [{ interaction: {
      kind: "drag-drop",
      audioDurationMs: 1250.75,
      panels: [{
        surface: { width: 1024.4, height: 581.6 },
        images: [{ area: { x: -0.4, y: 18.7, width: 400.6, height: 200.2 } }],
        dropTargets: [{ area: { x: 1000.8, y: 570.2, width: 80.4, height: 30.6 } }],
      }],
      presentation: { bankWordStyle: { fontSize: 23.6 }, placedAnswerStyle: { fontSize: 19.4 } },
    }}],
  };
}

test("editable historical decimals normalize to stable integer visual values without changing semantic timing", () => {
  const original = historicalDraft();
  const projected = projectNativeActivityPublicForAuthoring(original);
  const panel = projected.parts[0].interaction.panels[0];
  assert.deepEqual(panel.surface, { width: 1024, height: 582 });
  assert.deepEqual(panel.images[0].area, { x: 0, y: 19, width: 401, height: 200 });
  assert.deepEqual(panel.dropTargets[0].area, { x: 944, y: 551, width: 80, height: 31 });
  assert.equal(projected.parts[0].interaction.presentation.bankWordStyle.fontSize, 24);
  assert.equal(projected.parts[0].interaction.audioDurationMs, 1250.75);
  assert.equal(projected.metadata.visibleInstructionText, "");
  assert.equal(original.metadata.visibleInstructionText, "Published instruction", "projection does not mutate immutable source material");
  assert.deepEqual(normalizeNativeActivityAuthoringVisualValues(projected), projected, "canonicalization is idempotent");
});

test("the save API canonicalizes visual values at the outgoing draft mutation boundary", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ publicDocument: body.publicDocument, teacherDocument: body.teacherDocument }) };
  };
  try {
    await saveNativeActivityPair({
      bookSlug: "ultimate-b2",
      componentSlug: "ultimate-b2-students-book",
      activityId: "ultimate-b2-sb-u1-p1-o96",
      expectedPublicRevision: 1,
      expectedTeacherRevision: 1,
      publicDocument: historicalDraft(),
      teacherDocument: { parts: [{ solution: { cueStartMs: 100.25 } }] },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.ok(Object.values(body.publicDocument.parts[0].interaction.panels[0].dropTargets[0].area).every(Number.isSafeInteger));
  assert.equal(body.teacherDocument.parts[0].solution.cueStartMs, 100.25);
});

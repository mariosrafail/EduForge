import assert from "node:assert/strict";
import test from "node:test";

import { buildTeacherProjectWeb } from "../scripts/teacher-project-builder/build-web.mjs";
import { createCompleteTeacherProjectFixture } from "./helpers/teacher-project-fixture.mjs";

test("complete synthetic Teacher Project builds through the isolated generic web entry", { timeout: 120_000 }, async (t) => {
  const fixture = await createCompleteTeacherProjectFixture();
  t.after(fixture.cleanup);
  const stages = [];
  const result = await buildTeacherProjectWeb({ workspace: fixture.workspace, projectId: fixture.project.projectId, onStage: (stage) => stages.push(stage) });
  assert.equal(result.verification.status, "generic-teacher-project-bundle-safe");
  assert.equal(result.verification.projectAssetCount, result.manifest.assetIds.length);
  assert.deepEqual(stages, ["Validating project", "Building Teacher app", "Verifying Teacher bundle"]);
  assert.equal(result.runtimeConfig.units.length, 10);
  assert.equal(result.runtimeConfig.editions.length, 4);
  assert.equal(result.runtimeConfig.toolbar.length, 18);
});

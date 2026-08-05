import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateAuthoringWorkspace } from "../scripts/book-builder/review-studio-authoring.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

test("authoring workspace validation refuses temp and repository paths by default", async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "hhplms-authoring-mode-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  await assert.rejects(validateAuthoringWorkspace(temporary, { repositoryRoot }), (error) => error.code === "authoring_workspace_temporary");
  assert.equal(await validateAuthoringWorkspace(temporary, { repositoryRoot, testOnlyAllowTemporary: true }), await fs.realpath(temporary));
  await assert.rejects(validateAuthoringWorkspace(repositoryRoot, { repositoryRoot, testOnlyAllowTemporary: true }), (error) => error.code === "authoring_workspace_repository_contained");
});

test("persistent local application-data workspaces are allowed but source containment fails closed", async (t) => {
  const localRoot = process.env.LOCALAPPDATA
    || process.env.XDG_DATA_HOME
    || (process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : path.join(os.homedir(), ".local", "share"));
  const workspace = path.join(localRoot, "HamiltonHouseLMS", `BookBuilderValidation-test-${process.pid}-${Date.now()}`);
  await fs.mkdir(path.join(workspace, "projects"), { recursive: true });
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  assert.equal(await validateAuthoringWorkspace(workspace, { repositoryRoot }), await fs.realpath(workspace));
  const projectRoot = path.join(workspace, "projects", "fictional-source-overlap");
  const nestedSource = path.join(workspace, "source");
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.mkdir(nestedSource, { recursive: true });
  await fs.writeFile(path.join(projectRoot, "local-source-binding.json"), JSON.stringify({ selectedOuterRealPath: nestedSource, canonicalApplicationRealPath: nestedSource }));
  await assert.rejects(validateAuthoringWorkspace(workspace, { repositoryRoot }), (error) => error.code === "authoring_workspace_source_contained");
});

test("package scripts keep read-only default and require an explicit edit entry point", async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(repositoryRoot, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["dev:book-builder"], "node scripts/book-builder/dev-review-studio.mjs");
  assert.equal(packageJson.scripts["dev:book-builder:edit"], "node scripts/book-builder/dev-review-studio.mjs --edit");
  const launcher = await fs.readFile(path.join(repositoryRoot, "scripts", "book-builder", "dev-review-studio.mjs"), "utf8");
  const authoring = await fs.readFile(path.join(repositoryRoot, "scripts", "book-builder", "review-studio-authoring.mjs"), "utf8");
  assert.match(launcher, /AUTHORING_CONFIRMATION/);
  assert.match(authoring, /local-book-project-writes/);
  assert.match(launcher, /host: "127\.0\.0\.1"/);
  assert.doesNotMatch(launcher, /host: "0\.0\.0\.0"/);
});

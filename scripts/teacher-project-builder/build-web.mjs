import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { build } from "vite";

import { prepareTeacherProjectBuild, validatePreparedTeacherProjectBuild } from "../../lib/teacher-project-builder/build-staging.js";
import { TeacherProjectStore } from "../../lib/teacher-project-builder/store.js";
import { verifyTeacherProjectBundle } from "./verify-bundle.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const fixedLogoPath = path.join(repositoryRoot, "src/assets/teacher-shell/hamilton-house-logo.png");

export async function buildTeacherProjectWeb({ workspace, projectId, onStage = () => {} } = {}) {
  const store = new TeacherProjectStore({ workspace });
  onStage("Validating project");
  const prepared = await validatePreparedTeacherProjectBuild(await prepareTeacherProjectBuild({ store, projectId }));
  onStage("Building Teacher app");
  const previous = {
    VITE_APP_MODE: process.env.VITE_APP_MODE,
    TEACHER_PROJECT_PUBLIC_DIR: process.env.TEACHER_PROJECT_PUBLIC_DIR,
    TEACHER_PROJECT_RUNTIME_CONFIG: process.env.TEACHER_PROJECT_RUNTIME_CONFIG,
  };
  process.env.VITE_APP_MODE = "android-teacher-project";
  process.env.TEACHER_PROJECT_PUBLIC_DIR = prepared.publicRoot;
  process.env.TEACHER_PROJECT_RUNTIME_CONFIG = prepared.runtimeConfigPath;
  try {
    await build({ root: repositoryRoot, configFile: path.join(repositoryRoot, "vite.config.js"), mode: "production" });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  onStage("Verifying Teacher bundle");
  const fixedLogoSha256 = createHash("sha256").update(await fs.readFile(fixedLogoPath)).digest("hex");
  const verification = await verifyTeacherProjectBundle({
    distRoot: path.join(repositoryRoot, "dist"),
    project: prepared.project,
    stagingManifest: prepared.manifest,
    fixedLogoSha256,
  });
  return { ...prepared, verification, distRoot: path.join(repositoryRoot, "dist") };
}

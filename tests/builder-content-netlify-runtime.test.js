import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { rolldown } from "rolldown";

const functionEntry = path.resolve("netlify-sites/ultimate-b2-builder/functions/builder-content.js");
const registryPath = path.resolve("netlify-sites/ultimate-b2-builder/functions/_builder-content-registry.js");
const hotspotManifestPattern = /scripts[\\/]ultimate-b2[\\/]hotspot-manifest\.mjs$/;

test("deployed-style CommonJS Function initialization preserves the ESM hotspot validator boundary", async () => {
  const registrySource = await readFile(registryPath, "utf8");
  assert.doesNotMatch(registrySource, /from\s+["'][^"']*hotspot-manifest\.mjs["']/);
  assert.match(registrySource, /import\(["']\.\.\/\.\.\/\.\.\/scripts\/ultimate-b2\/hotspot-manifest\.mjs["']\)/);

  const bundle = await rolldown({
    input: functionEntry,
    external: (id) => hotspotManifestPattern.test(id),
  });
  try {
    const generated = await bundle.generate({ format: "cjs" });
    const artifact = generated.output.find((output) => output.type === "chunk")?.code || "";
    assert.ok(artifact, "The deployed-style builder-content artifact was not generated.");
    assert.doesNotMatch(artifact, /require\(["'][^"']*hotspot-manifest\.mjs["']\)/);
    assert.match(artifact, /import\(["'][^"']*hotspot-manifest\.mjs["']\)/);

    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hhplms-builder-content-"));
    const artifactPath = path.join(temporaryDirectory, "builder-content.cjs");
    try {
      await writeFile(artifactPath, artifact, "utf8");
      const loaded = createRequire(import.meta.url)(artifactPath);
      assert.equal(typeof loaded.handler, "function");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  } finally {
    await bundle.close();
  }
});

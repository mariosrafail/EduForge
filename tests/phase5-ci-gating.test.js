import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("CI gates the Phase 5 native publication runtime suite after both required review builds", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(workflow, /build:netlify:ultimate-b2-builder[\s\S]*verify:netlify:ultimate-b2-builder[\s\S]*test:builder:hosted-native-activity[\s\S]*build:netlify:ultimate-b2-interactive[\s\S]*verify:netlify:ultimate-b2-interactive[\s\S]*test:builder:publication/);
});

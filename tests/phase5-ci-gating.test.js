import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("CI gates atomic product publication after both required review builds", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["test:builder:publication"], "npm run test:builder:product-publication");
  assert.match(workflow, /build:netlify:ultimate-b2-builder[\s\S]*verify:netlify:ultimate-b2-builder[\s\S]*test:builder:hosted-native-activity[\s\S]*build:netlify:ultimate-b2-interactive[\s\S]*verify:netlify:ultimate-b2-interactive[\s\S]*test:builder:product-publication/);
});

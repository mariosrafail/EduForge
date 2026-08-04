import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const visualScriptPath = path.join(repositoryRoot, "scripts/ultimate-b2/legacy-pilot-visual.mjs");

test("legacy visual script uses the new launcher flow and targets Unit 1", async () => {
  const scriptSource = await readFile(visualScriptPath, "utf8");

  assert.match(scriptSource, /legacyPilotActivityUnit\(/, "legacy pilot unit resolver should be present");
  assert.match(scriptSource, /legacyPilotActivityUnitLabel\(/, "legacy pilot unit button label helper should be present");
  assert.match(scriptSource, /targetUnitsFromActivities\(/, "legacy pilot unit extraction helper should be present");
  assert.match(scriptSource, /openPilotBookFromLauncher\(/, "legacy pilot launcher helper should be present");

  assert.equal(scriptSource.includes('getByRole("button", { name: "Open Students Book" })'), false, "retired launcher control must not be used");
  assert.equal(
    scriptSource.includes('getByRole("button", { name: /^Open Unit 1:/ })')
      || scriptSource.includes('getByRole("button", { name: legacyPilotActivityUnitLabel(targetUnit) })'),
    true,
    "script should click the visible open-unit launcher",
  );
  assert.match(scriptSource, /Contents and exercises/, "script should still enter contents/exercises after unit open");

  const unitMatches = [...scriptSource.matchAll(/ultimate-b2-sb-u(\d+)-/g)].map((match) => Number(match[1]));
  assert.ok(unitMatches.length > 0, "legacy pilot targets must include activity ids");
  const targetUnits = [...new Set(unitMatches)].sort((left, right) => left - right);
  assert.deepEqual(targetUnits, [1], "legacy visual targets should remain Unit 1 only");
});

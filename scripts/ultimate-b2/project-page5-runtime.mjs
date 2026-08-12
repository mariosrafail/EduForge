import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  projectUltimateB2Page5ImageRuntime,
  projectUltimateB2Page5OpenResponseRuntime,
} from "../../src/data/ultimate-b2/page5RuntimeProjection.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const projections = [
  {
    source: "src/data/ultimate-b2/authoring/unit-01-page-5-exercise-1.open-response.json",
    destination: "src/data/ultimate-b2/runtime/unit-01-page-5-exercise-1.open-response.json",
    project: projectUltimateB2Page5OpenResponseRuntime,
  },
  {
    source: "src/data/ultimate-b2/authoring/unit-01-page-5-exercise-2.image.json",
    destination: "src/data/ultimate-b2/runtime/unit-01-page-5-exercise-2.image.json",
    project: projectUltimateB2Page5ImageRuntime,
  },
];

for (const projection of projections) {
  const source = JSON.parse(await readFile(path.join(repositoryRoot, projection.source), "utf8"));
  const destination = path.join(repositoryRoot, projection.destination);
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(projection.project(source), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, destination);
}

console.log(JSON.stringify({ projected: projections.map(({ source, destination }) => ({ source, destination })) }, null, 2));

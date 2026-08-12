import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  projectStudentReadingActivity,
  projectTeacherReadingSolution,
} from "../../src/data/ultimate-b2/readingExerciseProjections.js";
import {
  ULTIMATE_B2_COMPLETE_SENTENCES_ID,
  ULTIMATE_B2_DEBATE_CLUB_ID,
} from "../../src/data/ultimate-b2/readingExerciseAuthoringSchema.js";

export const ultimateB2ReadingProjectionFiles = Object.freeze({
  [ULTIMATE_B2_COMPLETE_SENTENCES_ID]: Object.freeze({
    authoring: "src/data/ultimate-b2/authoring/unit-01-reading-exercise-4.complete-sentences.json",
    student: "src/data/ultimate-b2/runtime/unit-01-reading-exercise-4.complete-sentences.json",
    teacher: "netlify/functions/_ultimate-b2-reading-exercise-4-solution.json",
  }),
  [ULTIMATE_B2_DEBATE_CLUB_ID]: Object.freeze({
    authoring: "src/data/ultimate-b2/authoring/unit-01-reading-debate-club.open-answer.json",
    student: "src/data/ultimate-b2/runtime/unit-01-reading-debate-club.open-answer.json",
    teacher: "netlify/functions/_ultimate-b2-reading-debate-club-solution.json",
  }),
});

async function atomicWriteJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, file);
}

export async function projectUltimateB2ReadingRuntime({ repositoryRoot = path.resolve(import.meta.dirname, "../..") } = {}) {
  const results = [];
  for (const [activityId, files] of Object.entries(ultimateB2ReadingProjectionFiles)) {
    const authoring = JSON.parse(await readFile(path.join(repositoryRoot, files.authoring), "utf8"));
    const student = projectStudentReadingActivity(authoring);
    const teacher = projectTeacherReadingSolution(authoring);
    await atomicWriteJson(path.join(repositoryRoot, files.student), student);
    await atomicWriteJson(path.join(repositoryRoot, files.teacher), teacher);
    results.push({ activityId, student: files.student, teacher: files.teacher });
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  console.log(JSON.stringify({ projected: await projectUltimateB2ReadingRuntime() }, null, 2));
}

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { importUltimateB2CompleteSentencesPublisherSource } from "./complete-sentences-publisher-importer.mjs";
import { importUltimateB2DebateClubPublisherSource } from "./debate-club-publisher-importer.mjs";
import { readAuthoringJson, repositoryFileTarget, resolveUltimateB2ContentRoot, writeAuthoringJson } from "./content-workspace.mjs";

import {
  normalizeUltimateB2ReadingExerciseAuthoring,
  ultimateB2ReadingExerciseLimits,
  ULTIMATE_B2_COMPLETE_SENTENCES_ID,
  ULTIMATE_B2_DEBATE_CLUB_ID,
} from "../../src/data/ultimate-b2/readingExerciseAuthoringSchema.js";
import {
  projectStudentReadingActivity,
  projectTeacherReadingSolution,
} from "../../src/data/ultimate-b2/readingExerciseProjections.js";

export const readingExerciseAuthoringEndpoint = "/__hhplms/ultimate-b2-reading-exercise-authoring";
export const completeSentencesPublisherImportEndpoint = "/__hhplms/ultimate-b2-complete-sentences-publisher-import";
export const debateClubPublisherImportEndpoint = "/__hhplms/ultimate-b2-debate-club-publisher-import";
const defaultPaths = Object.freeze({
  [ULTIMATE_B2_COMPLETE_SENTENCES_ID]: path.resolve(import.meta.dirname, "../../src/data/ultimate-b2/authoring/unit-01-reading-exercise-4.complete-sentences.json"),
  [ULTIMATE_B2_DEBATE_CLUB_ID]: path.resolve(import.meta.dirname, "../../src/data/ultimate-b2/authoring/unit-01-reading-debate-club.open-answer.json"),
});
const defaultStudentProjectionPaths = Object.freeze({
  [ULTIMATE_B2_COMPLETE_SENTENCES_ID]: path.resolve(import.meta.dirname, "../../src/data/ultimate-b2/runtime/unit-01-reading-exercise-4.complete-sentences.json"),
  [ULTIMATE_B2_DEBATE_CLUB_ID]: path.resolve(import.meta.dirname, "../../src/data/ultimate-b2/runtime/unit-01-reading-debate-club.open-answer.json"),
});
const defaultTeacherProjectionPaths = Object.freeze({
  [ULTIMATE_B2_COMPLETE_SENTENCES_ID]: path.resolve(import.meta.dirname, "../../netlify/functions/_ultimate-b2-reading-exercise-4-solution.json"),
  [ULTIMATE_B2_DEBATE_CLUB_ID]: path.resolve(import.meta.dirname, "../../netlify/functions/_ultimate-b2-reading-debate-club-solution.json"),
});
const defaultDebateClubPublisherSourceDirectory = path.resolve(import.meta.dirname, "../../tmp/debateclub");
const defaultCompleteSentencesPublisherSourceFile = path.resolve(import.meta.dirname, "../../tmp/complete-sentences/obj_params.xml");
const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > ultimateB2ReadingExerciseLimits.payloadBytes) throw new Error("Reading exercise authoring payload is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function atomicWrite(outputPath, value) {
  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, outputPath);
}

function exactEnvelope(value, activityId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Reading exercise authoring request must be an object.");
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("activityId") || !keys.includes("authoring")) throw new Error("Reading exercise authoring request has missing or unknown fields.");
  if (value.activityId !== activityId) throw new Error("Request activity ID does not match the endpoint selection.");
}

export function ultimateB2ReadingExerciseBuilderPlugin({ authoringPaths = defaultPaths, studentProjectionPaths = null, teacherProjectionPaths = null, completeSentencesPublisherSourceFile = defaultCompleteSentencesPublisherSourceFile, debateClubPublisherSourceDirectory = defaultDebateClubPublisherSourceDirectory, environment = process.env } = {}) {
  const workspaceRoot = resolveUltimateB2ContentRoot(environment);
  const projectionPath = (paths, defaults, activityId, suffix) => paths?.[activityId]
    || (authoringPaths === defaultPaths ? defaults[activityId] : `${authoringPaths[activityId]}.${suffix}.json`);
  const authoringTargets = Object.fromEntries(Object.entries(authoringPaths).map(([activityId, repositoryAuthoringPath]) => [activityId, repositoryFileTarget(repositoryAuthoringPath, workspaceRoot, `students-book/activities/unit-01/${activityId}/source-private/authoring/${path.basename(repositoryAuthoringPath)}`)]));
  const studentTargets = Object.fromEntries(Object.keys(authoringPaths).map((activityId) => [activityId, repositoryFileTarget(
    projectionPath(studentProjectionPaths, defaultStudentProjectionPaths, activityId, "student-runtime"),
    workspaceRoot,
    `students-book/activities/unit-01/${activityId}/student-runtime/reading-presentation.json`,
  )]));
  const teacherTargets = Object.fromEntries(Object.keys(authoringPaths).map((activityId) => [activityId, repositoryFileTarget(
    projectionPath(teacherProjectionPaths, defaultTeacherProjectionPaths, activityId, "teacher-private"),
    workspaceRoot,
    `students-book/activities/unit-01/${activityId}/teacher-private/reading-solution.json`,
  )]));

  async function persistAuthoringAndProjections(activityId, authoring, operation) {
    await writeAuthoringJson(authoringTargets[activityId], authoring, { workspaceRoot, operation });
    await writeAuthoringJson(studentTargets[activityId], projectStudentReadingActivity(authoring), { workspaceRoot, operation: `${operation}-student-projection` });
    await writeAuthoringJson(teacherTargets[activityId], projectTeacherReadingSolution(authoring), { workspaceRoot, operation: `${operation}-teacher-projection` });
  }
  return {
    name: "hhplms-ultimate-b2-reading-exercise-builder",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || "/", "http://localhost");
        if (![readingExerciseAuthoringEndpoint, completeSentencesPublisherImportEndpoint, debateClubPublisherImportEndpoint].includes(url.pathname)) return next();
        try {
          if (!loopbackAddresses.has(request.socket.remoteAddress || "")) return sendJson(response, 403, { error: "The authoring endpoint is local-only." });
          const activityId = url.searchParams.get("activityId");
          const authoringTarget = authoringTargets[activityId];
          if (!authoringTarget) return sendJson(response, 404, { error: "Unknown Reading exercise activity." });
          if (url.pathname === completeSentencesPublisherImportEndpoint) {
            if ([...url.searchParams.keys()].some((key) => key !== "activityId") || activityId !== ULTIMATE_B2_COMPLETE_SENTENCES_ID) return sendJson(response, 404, { error: "Unknown publisher-source import target." });
            if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
            const imported = await importUltimateB2CompleteSentencesPublisherSource(completeSentencesPublisherSourceFile);
            await persistAuthoringAndProjections(activityId, imported.authoring, "complete-sentences-import");
            return sendJson(response, 200, imported);
          }
          if (url.pathname === debateClubPublisherImportEndpoint) {
            if ([...url.searchParams.keys()].some((key) => key !== "activityId") || activityId !== ULTIMATE_B2_DEBATE_CLUB_ID) return sendJson(response, 404, { error: "Unknown publisher-source import target." });
            if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
            const imported = await importUltimateB2DebateClubPublisherSource(debateClubPublisherSourceDirectory);
            await persistAuthoringAndProjections(activityId, imported.authoring, "debate-club-import");
            return sendJson(response, 200, imported);
          }
          if (request.method === "GET") return sendJson(response, 200, normalizeUltimateB2ReadingExerciseAuthoring(await readAuthoringJson(authoringTarget)));
          if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) return sendJson(response, 415, { error: "Expected an application/json request." });
          const body = await readBody(request);
          exactEnvelope(body, activityId);
          const normalized = normalizeUltimateB2ReadingExerciseAuthoring(body.authoring);
          const current = normalizeUltimateB2ReadingExerciseAuthoring(await readAuthoringJson(authoringTarget));
          normalized.source = current.source;
          await persistAuthoringAndProjections(activityId, normalized, "reading-exercise-save");
          return sendJson(response, 200, normalized);
        } catch (error) {
          return sendJson(response, 400, { error: error.message || "Reading exercise authoring could not be saved." });
        }
      });
    },
  };
}

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  normalizeUltimateB2ReadingExerciseAuthoring,
  ultimateB2ReadingExerciseLimits,
  ULTIMATE_B2_COMPLETE_SENTENCES_ID,
  ULTIMATE_B2_DEBATE_CLUB_ID,
} from "../../src/data/ultimate-b2/readingExerciseAuthoringSchema.js";

export const readingExerciseAuthoringEndpoint = "/__hhplms/ultimate-b2-reading-exercise-authoring";
const defaultPaths = Object.freeze({
  [ULTIMATE_B2_COMPLETE_SENTENCES_ID]: path.resolve(import.meta.dirname, "../../src/data/ultimate-b2/authoring/unit-01-reading-exercise-4.complete-sentences.json"),
  [ULTIMATE_B2_DEBATE_CLUB_ID]: path.resolve(import.meta.dirname, "../../src/data/ultimate-b2/authoring/unit-01-reading-debate-club.open-answer.json"),
});
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

export function ultimateB2ReadingExerciseBuilderPlugin({ authoringPaths = defaultPaths } = {}) {
  return {
    name: "hhplms-ultimate-b2-reading-exercise-builder",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || "/", "http://localhost");
        if (url.pathname !== readingExerciseAuthoringEndpoint) return next();
        try {
          if (!loopbackAddresses.has(request.socket.remoteAddress || "")) return sendJson(response, 403, { error: "The authoring endpoint is local-only." });
          const activityId = url.searchParams.get("activityId");
          const authoringPath = authoringPaths[activityId];
          if (!authoringPath) return sendJson(response, 404, { error: "Unknown Reading exercise activity." });
          if (request.method === "GET") return sendJson(response, 200, normalizeUltimateB2ReadingExerciseAuthoring(JSON.parse(await readFile(authoringPath, "utf8"))));
          if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) return sendJson(response, 415, { error: "Expected an application/json request." });
          const body = await readBody(request);
          exactEnvelope(body, activityId);
          const normalized = normalizeUltimateB2ReadingExerciseAuthoring(body.authoring);
          const current = normalizeUltimateB2ReadingExerciseAuthoring(JSON.parse(await readFile(authoringPath, "utf8")));
          normalized.source = current.source;
          await atomicWrite(authoringPath, normalized);
          return sendJson(response, 200, normalized);
        } catch (error) {
          return sendJson(response, 400, { error: error.message || "Reading exercise authoring could not be saved." });
        }
      });
    },
  };
}

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  normalizeUltimateB2Page5OpenResponseAuthoring,
  normalizeUltimateB2Page5PublisherDisplayAuthoring,
  normalizeUltimateB2Page5TeacherAnswers,
  ultimateB2Page5AuthoringLimits,
  ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID,
  ULTIMATE_B2_PAGE5_PUBLISHER_DISPLAY_ID,
} from "../../src/data/ultimate-b2/page5AuthoringSchema.js";

export const page5AuthoringEndpoint = "/__hhplms/ultimate-b2-page-5-authoring";

const defaultOpenResponsePath = path.resolve(import.meta.dirname, "../../src/data/ultimate-b2/authoring/unit-01-page-5-exercise-1.open-response.json");
const defaultPublisherDisplayPath = path.resolve(import.meta.dirname, "../../src/data/ultimate-b2/authoring/unit-01-page-5-exercise-2.publisher-display.json");
const defaultTeacherAnswersPath = path.resolve(import.meta.dirname, "../../netlify/functions/_ultimate-b2-unit1-opener-model-answers.json");
const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > ultimateB2Page5AuthoringLimits.payloadBytes) throw new Error("Page 5 authoring payload is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function writeTemporary(outputPath, value) {
  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return temporaryPath;
}

function exactEnvelope(value, activityId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Page 5 authoring request must be an object.");
  const allowed = activityId === ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID
    ? ["activityId", "publicAuthoring", "teacherAuthoring"]
    : ["activityId", "publicAuthoring"];
  const keys = Object.keys(value);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key)) || allowed.some((key) => !keys.includes(key))) {
    throw new Error("Page 5 authoring request has missing or unknown fields.");
  }
}

export function ultimateB2Page5BuilderPlugin({
  openResponsePath = defaultOpenResponsePath,
  publisherDisplayPath = defaultPublisherDisplayPath,
  teacherAnswersPath = defaultTeacherAnswersPath,
} = {}) {
  return {
    name: "hhplms-ultimate-b2-page-5-builder",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || "/", "http://localhost");
        if (url.pathname !== page5AuthoringEndpoint) return next();
        try {
          if (!loopbackAddresses.has(request.socket.remoteAddress || "")) return sendJson(response, 403, { error: "The authoring endpoint is local-only." });
          const activityId = url.searchParams.get("activityId");
          if (![ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID, ULTIMATE_B2_PAGE5_PUBLISHER_DISPLAY_ID].includes(activityId)) return sendJson(response, 404, { error: "Unknown Page 5 activity." });

          if (request.method === "GET") {
            if (activityId === ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID) {
              return sendJson(response, 200, {
                activityId,
                publicAuthoring: normalizeUltimateB2Page5OpenResponseAuthoring(await readJson(openResponsePath)),
                teacherAuthoring: normalizeUltimateB2Page5TeacherAnswers(await readJson(teacherAnswersPath)),
              });
            }
            return sendJson(response, 200, {
              activityId,
              publicAuthoring: normalizeUltimateB2Page5PublisherDisplayAuthoring(await readJson(publisherDisplayPath)),
            });
          }

          if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) return sendJson(response, 415, { error: "Expected an application/json request." });
          const body = await readBody(request);
          exactEnvelope(body, activityId);
          if (body.activityId !== activityId) throw new Error("Request activity ID does not match the endpoint selection.");

          if (activityId === ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID) {
            const publicAuthoring = normalizeUltimateB2Page5OpenResponseAuthoring(body.publicAuthoring);
            const teacherAuthoring = normalizeUltimateB2Page5TeacherAnswers(body.teacherAuthoring);
            const [publicTemporaryPath, teacherTemporaryPath] = await Promise.all([
              writeTemporary(openResponsePath, publicAuthoring),
              writeTemporary(teacherAnswersPath, teacherAuthoring),
            ]);
            await rename(publicTemporaryPath, openResponsePath);
            await rename(teacherTemporaryPath, teacherAnswersPath);
            return sendJson(response, 200, { activityId, publicAuthoring, teacherAuthoring });
          }

          const publicAuthoring = normalizeUltimateB2Page5PublisherDisplayAuthoring(body.publicAuthoring);
          const temporaryPath = await writeTemporary(publisherDisplayPath, publicAuthoring);
          await rename(temporaryPath, publisherDisplayPath);
          return sendJson(response, 200, { activityId, publicAuthoring });
        } catch (error) {
          return sendJson(response, 400, { error: error.message || "Page 5 authoring could not be saved." });
        }
      });
    },
  };
}

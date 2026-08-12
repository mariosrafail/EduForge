import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizeMultipleChoiceAuthoring } from "../../src/data/ultimate-b2/multipleChoiceAuthoringSchema.js";
import { readAuthoringJson, repositoryFileTarget, resolveUltimateB2ContentRoot, writeAuthoringJson } from "./content-workspace.mjs";

export const multipleChoiceEndpoint = "/__hhplms/ultimate-b2-multiple-choice-authoring";
const defaultPath = path.resolve(import.meta.dirname, "../../src/data/ultimate-b2/authoring/unit-01-reading-exercise-3.multiple-choice.json");
const loopback = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function send(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 160_000) throw new Error("Multiple-choice authoring payload is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function atomicWrite(outputPath, value) {
  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, outputPath);
}

export function ultimateB2MultipleChoiceBuilderPlugin({ authoringPath = defaultPath, environment = process.env } = {}) {
  const workspaceRoot = resolveUltimateB2ContentRoot(environment);
  const authoringTarget = repositoryFileTarget(authoringPath, workspaceRoot, "students-book/activities/unit-01/ultimate-b2-sb-u1-p2-o3/source-private/authoring/unit-01-reading-exercise-3.multiple-choice.json");
  return {
    name: "hhplms-ultimate-b2-multiple-choice-builder",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || "/", "http://localhost").pathname;
        if (pathname !== multipleChoiceEndpoint) return next();
        try {
          if (!loopback.has(request.socket.remoteAddress || "")) return send(response, 403, { error: "The authoring endpoint is local-only." });
          if (request.method === "GET") return send(response, 200, normalizeMultipleChoiceAuthoring(await readAuthoringJson(authoringTarget)));
          if (request.method !== "POST") return send(response, 405, { error: "Method not allowed" });
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) return send(response, 415, { error: "Expected an application/json request." });
          const normalized = normalizeMultipleChoiceAuthoring(await readBody(request));
          const current = normalizeMultipleChoiceAuthoring(await readAuthoringJson(authoringTarget));
          normalized.source = current.source;
          await writeAuthoringJson(authoringTarget, normalized, { workspaceRoot, operation: "multiple-choice-save" });
          return send(response, 200, normalized);
        } catch (error) {
          return send(response, 400, { error: error.message || "Multiple-choice authoring could not be saved." });
        }
      });
    },
  };
}

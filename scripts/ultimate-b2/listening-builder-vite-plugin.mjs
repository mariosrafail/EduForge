import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  assertUltimateB2ListeningAuthoring,
  ultimateB2ListeningAuthoringLimits,
} from "../../src/data/ultimate-b2/listeningAuthoringSchema.js";

const listeningEndpoint = "/__hhplms/ultimate-b2-listening-authoring";
const defaultListeningPath = path.resolve(import.meta.dirname, "../../src/data/ultimate-b2/authoring/unit-01-reading-exercise-2.listening.json");
const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function json(response, statusCode, payload) {
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
    if (size > ultimateB2ListeningAuthoringLimits.payloadBytes) throw new Error("Listening authoring manifest is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function writeAtomically(outputPath, value) {
  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, outputPath);
}

export function ultimateB2ListeningBuilderPlugin({ listeningPath = defaultListeningPath } = {}) {
  return {
    name: "hhplms-ultimate-b2-listening-builder",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || "/", "http://localhost").pathname;
        if (pathname !== listeningEndpoint) return next();
        try {
          if (!loopbackAddresses.has(request.socket.remoteAddress || "")) return json(response, 403, { error: "The authoring endpoint is local-only." });
          if (request.method === "GET") {
            return json(response, 200, assertUltimateB2ListeningAuthoring(JSON.parse(await readFile(listeningPath, "utf8"))));
          }
          if (request.method !== "POST") return json(response, 405, { error: "Method not allowed" });
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) return json(response, 415, { error: "Expected an application/json request." });
          const normalized = assertUltimateB2ListeningAuthoring(await readBody(request));
          await writeAtomically(listeningPath, normalized);
          return json(response, 200, normalized);
        } catch (error) {
          return json(response, 400, { error: error.message || "Listening authoring manifest could not be saved." });
        }
      });
    },
  };
}

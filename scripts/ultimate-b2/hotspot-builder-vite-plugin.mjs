import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateAndNormalizeUltimateB2HotspotManifest } from "./hotspot-manifest.mjs";

const endpoint = "/__eduforge/ultimate-b2-hotspots";
const manifestPath = path.resolve(import.meta.dirname, "../../src/data/ultimate-b2/authoring/studentsBookHotspots.json");
const maximumBodyBytes = 2 * 1024 * 1024;
const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function json(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readManifest() {
  return validateAndNormalizeUltimateB2HotspotManifest(JSON.parse(await readFile(manifestPath, "utf8")));
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBodyBytes) throw new Error("Hotspot manifest is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function ultimateB2HotspotBuilderPlugin() {
  return {
    name: "eduforge-ultimate-b2-hotspot-builder",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || "/", "http://localhost").pathname;
        if (pathname !== endpoint) return next();
        try {
          if (!loopbackAddresses.has(request.socket.remoteAddress || "")) return json(response, 403, { error: "The hotspot builder endpoint is local-only." });
          if (request.method === "GET") return json(response, 200, await readManifest());
          if (request.method !== "POST") return json(response, 405, { error: "Method not allowed" });
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) return json(response, 415, { error: "Expected an application/json request." });
          const normalized = validateAndNormalizeUltimateB2HotspotManifest(await readRequestBody(request));
          await writeFile(manifestPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
          return json(response, 200, normalized);
        } catch (error) {
          return json(response, 400, { error: error.message || "Hotspot manifest could not be saved." });
        }
      });
    },
  };
}

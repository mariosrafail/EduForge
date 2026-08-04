import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateAndNormalizeUltimateB2HotspotManifest } from "./hotspot-manifest.mjs";
import { validateAndNormalizeBookMenuSkinSelections } from "../../src/config/bookMenuSkins.js";

const hotspotEndpoint = "/__hhplms/ultimate-b2-hotspots";
const menuSkinEndpoint = "/__hhplms/book-menu-skin-selection";
const manifestPath = path.resolve(import.meta.dirname, "../../src/data/ultimate-b2/authoring/studentsBookHotspots.json");
const menuSkinSelectionsPath = path.resolve(import.meta.dirname, "../../src/config/bookMenuSkinSelections.json");
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

async function readMenuSkinSelections() {
  return validateAndNormalizeBookMenuSkinSelections(JSON.parse(await readFile(menuSkinSelectionsPath, "utf8")));
}

async function readRequestBody(request, description) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBodyBytes) throw new Error(`${description} is too large.`);
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function ultimateB2HotspotBuilderPlugin() {
  return {
    name: "hhplms-ultimate-b2-hotspot-builder",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || "/", "http://localhost").pathname;
        if (![hotspotEndpoint, menuSkinEndpoint].includes(pathname)) return next();
        try {
          if (!loopbackAddresses.has(request.socket.remoteAddress || "")) return json(response, 403, { error: "The authoring endpoint is local-only." });
          if (request.method === "GET") {
            return json(response, 200, pathname === hotspotEndpoint ? await readManifest() : await readMenuSkinSelections());
          }
          if (request.method !== "POST") return json(response, 405, { error: "Method not allowed" });
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) return json(response, 415, { error: "Expected an application/json request." });
          const body = await readRequestBody(request, pathname === hotspotEndpoint ? "Hotspot manifest" : "Book menu skin selection");
          const normalized = pathname === hotspotEndpoint
            ? validateAndNormalizeUltimateB2HotspotManifest(body)
            : validateAndNormalizeBookMenuSkinSelections(body);
          const outputPath = pathname === hotspotEndpoint ? manifestPath : menuSkinSelectionsPath;
          await writeFile(outputPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
          return json(response, 200, normalized);
        } catch (error) {
          return json(response, 400, { error: error.message || "Hotspot manifest could not be saved." });
        }
      });
    },
  };
}

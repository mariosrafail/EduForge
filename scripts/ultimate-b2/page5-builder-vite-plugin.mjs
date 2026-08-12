import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { importUltimateB2Page5OpenResponsePublisherSource } from "./page5-open-response-publisher-importer.mjs";
import { readAuthoringJson, repositoryFileTarget, resolveInsideWorkspace, resolveUltimateB2ContentRoot, writeAuthoringBytes, writeAuthoringJson } from "./content-workspace.mjs";

import {
  normalizeUltimateB2Page5ImageAuthoring,
  normalizeUltimateB2Page5OpenResponseAuthoring,
  normalizeUltimateB2Page5TeacherAnswers,
  ultimateB2Page5AuthoringLimits,
  ULTIMATE_B2_PAGE5_IMAGE_ID,
  ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID,
} from "../../src/data/ultimate-b2/page5AuthoringSchema.js";

export const page5AuthoringEndpoint = "/__hhplms/ultimate-b2-page-5-authoring";
export const page5ImageAssetEndpoint = "/__hhplms/ultimate-b2-page-5-image-asset";
export const page5OpenResponsePublisherImportEndpoint = "/__hhplms/ultimate-b2-page-5-publisher-import";

const defaultOpenResponsePath = path.resolve(import.meta.dirname, "../../src/data/ultimate-b2/authoring/unit-01-page-5-exercise-1.open-response.json");
const defaultImagePath = path.resolve(import.meta.dirname, "../../src/data/ultimate-b2/authoring/unit-01-page-5-exercise-2.image.json");
const defaultTeacherAnswersPath = path.resolve(import.meta.dirname, "../../netlify/functions/_ultimate-b2-unit1-opener-model-answers.json");
const defaultImageAssetPath = path.resolve(import.meta.dirname, "../../src/assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj2/discussion-prompts.svg");
const defaultPublisherSourceDirectory = path.resolve(import.meta.dirname, "../../tmp/page5-open-response-source");
const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const acceptedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maximumImageBytes = 12 * 1024 * 1024;

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

async function readImageBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumImageBytes) throw new Error("Image file is larger than 12 MB.");
    chunks.push(chunk);
  }
  if (!size) throw new Error("Image file is empty.");
  return Buffer.concat(chunks);
}

async function atomicWrite(outputPath, value) {
  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, outputPath);
}

async function atomicWriteBytes(outputPath, bytes) {
  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(temporaryPath, bytes, { flag: "wx" });
  await rename(temporaryPath, outputPath);
}

async function normalizeImageAsset(bytes, contentType) {
  const metadata = await sharp(bytes, { failOn: "warning", limitInputPixels: 40_000_000 }).metadata();
  const expectedFormat = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" }[contentType];
  if (metadata.format !== expectedFormat) throw new Error("Image bytes do not match the declared file type.");
  if ((metadata.pages || 1) !== 1) throw new Error("Animated images are not supported.");
  const { data, info } = await sharp(bytes, { failOn: "warning", limitInputPixels: 40_000_000 })
    .rotate()
    .webp({ quality: 92, effort: 6 })
    .toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height || info.width < 16 || info.height < 16 || info.width > 8192 || info.height > 8192) throw new Error("Image dimensions must be between 16 and 8192 pixels.");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}" viewBox="0 0 ${info.width} ${info.height}" role="img" aria-label="Custom image activity artwork"><image width="${info.width}" height="${info.height}" href="data:image/webp;base64,${data.toString("base64")}"/></svg>\n`;
  return { bytes: Buffer.from(svg), width: info.width, height: info.height, sha256: createHash("sha256").update(data).digest("hex") };
}

function exactEnvelope(value, activityId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Page 5 authoring request must be an object.");
  const allowed = activityId === ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID ? ["activityId", "publicAuthoring", "teacherAuthoring"] : ["activityId", "publicAuthoring"];
  const keys = Object.keys(value);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key)) || allowed.some((key) => !keys.includes(key))) throw new Error("Page 5 authoring request has missing or unknown fields.");
}

export function ultimateB2Page5BuilderPlugin({
  openResponsePath = defaultOpenResponsePath,
  imagePath = defaultImagePath,
  teacherAnswersPath = defaultTeacherAnswersPath,
  imageAssetPath = defaultImageAssetPath,
  publisherSourceDirectory = defaultPublisherSourceDirectory,
  environment = process.env,
} = {}) {
  const workspaceRoot = resolveUltimateB2ContentRoot(environment);
  const openResponseTarget = repositoryFileTarget(openResponsePath, workspaceRoot, `students-book/activities/unit-01/${ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID}/source-private/authoring/${path.basename(openResponsePath)}`);
  const imageTarget = repositoryFileTarget(imagePath, workspaceRoot, `students-book/activities/unit-01/${ULTIMATE_B2_PAGE5_IMAGE_ID}/source-private/authoring/${path.basename(imagePath)}`);
  const teacherAnswersTarget = repositoryFileTarget(teacherAnswersPath, workspaceRoot, `students-book/activities/unit-01/${ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID}/teacher-private/model-answers.json`);
  const imageAssetTarget = repositoryFileTarget(imageAssetPath, workspaceRoot, `students-book/activities/unit-01/${ULTIMATE_B2_PAGE5_IMAGE_ID}/student-runtime/assets/discussion-prompts.svg`);
  return {
    name: "hhplms-ultimate-b2-page-5-builder",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || "/", "http://localhost");
        if (![page5AuthoringEndpoint, page5ImageAssetEndpoint, page5OpenResponsePublisherImportEndpoint].includes(url.pathname)) return next();
        try {
          if (!loopbackAddresses.has(request.socket.remoteAddress || "")) return sendJson(response, 403, { error: "The authoring endpoint is local-only." });
          const activityId = url.searchParams.get("activityId");
          if (url.pathname === page5OpenResponsePublisherImportEndpoint) {
            if ([...url.searchParams.keys()].some((key) => key !== "activityId") || activityId !== ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID) return sendJson(response, 404, { error: "Unknown publisher-source import target." });
            if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
            const imported = await importUltimateB2Page5OpenResponsePublisherSource(publisherSourceDirectory);
            await writeAuthoringJson(teacherAnswersTarget, imported.teacherAuthoring, { workspaceRoot, operation: "page5-import-teacher" });
            await writeAuthoringJson(openResponseTarget, imported.publicAuthoring, { workspaceRoot, operation: "page5-import-public" });
            return sendJson(response, 200, imported);
          }
          if (url.pathname === page5ImageAssetEndpoint) {
            if ([...url.searchParams.keys()].some((key) => key !== "activityId") || activityId !== ULTIMATE_B2_PAGE5_IMAGE_ID) return sendJson(response, 404, { error: "Unknown Image activity asset." });
            if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
            const contentType = String(request.headers["content-type"] || "").toLowerCase().split(";", 1)[0].trim();
            if (!acceptedImageTypes.has(contentType)) return sendJson(response, 415, { error: "Choose a PNG, JPEG or WebP image." });
            const uploadedBytes = await readImageBody(request);
            const normalized = await normalizeImageAsset(uploadedBytes, contentType);
            if (workspaceRoot) {
              const originalExtension = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" }[contentType];
              const originalPath = await resolveInsideWorkspace(workspaceRoot, `students-book/activities/unit-01/${ULTIMATE_B2_PAGE5_IMAGE_ID}/source-private/uploads/${normalized.sha256}${originalExtension}`, { allowMissing: true });
              await writeAuthoringBytes(originalPath, uploadedBytes, { operation: "page5-image-source-import" });
            }
            await writeAuthoringBytes(imageAssetTarget, normalized.bytes, { workspaceRoot, operation: "page5-image-projection" });
            return sendJson(response, 200, {
              activityId,
              binding: "unit1.page5.exercise2.main-content",
              mimeType: "image/webp",
              width: normalized.width,
              height: normalized.height,
              sha256: normalized.sha256,
            });
          }
          if (![ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID, ULTIMATE_B2_PAGE5_IMAGE_ID].includes(activityId)) return sendJson(response, 404, { error: "Unknown Page 5 activity." });
          if (request.method === "GET") {
            if (activityId === ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID) return sendJson(response, 200, { activityId, publicAuthoring: normalizeUltimateB2Page5OpenResponseAuthoring(await readAuthoringJson(openResponseTarget)), teacherAuthoring: normalizeUltimateB2Page5TeacherAnswers(await readAuthoringJson(teacherAnswersTarget)) });
            return sendJson(response, 200, { activityId, publicAuthoring: normalizeUltimateB2Page5ImageAuthoring(await readAuthoringJson(imageTarget)) });
          }
          if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) return sendJson(response, 415, { error: "Expected an application/json request." });
          const body = await readBody(request);
          exactEnvelope(body, activityId);
          if (body.activityId !== activityId) throw new Error("Request activity ID does not match the endpoint selection.");
          if (activityId === ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID) {
            const publicAuthoring = normalizeUltimateB2Page5OpenResponseAuthoring(body.publicAuthoring);
            const teacherAuthoring = normalizeUltimateB2Page5TeacherAnswers(body.teacherAuthoring);
            await writeAuthoringJson(teacherAnswersTarget, teacherAuthoring, { workspaceRoot, operation: "page5-teacher-save" });
            await writeAuthoringJson(openResponseTarget, publicAuthoring, { workspaceRoot, operation: "page5-public-save" });
            return sendJson(response, 200, { activityId, publicAuthoring, teacherAuthoring });
          }
          const publicAuthoring = normalizeUltimateB2Page5ImageAuthoring(body.publicAuthoring);
          await writeAuthoringJson(imageTarget, publicAuthoring, { workspaceRoot, operation: "page5-image-authoring-save" });
          return sendJson(response, 200, { activityId, publicAuthoring });
        } catch (error) {
          return sendJson(response, 400, { error: error.message || "Page 5 authoring could not be saved." });
        }
      });
    },
  };
}

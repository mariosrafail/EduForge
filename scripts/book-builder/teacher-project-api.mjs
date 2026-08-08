import { TEACHER_PROJECT_LIMITS } from "../../lib/teacher-project-builder/constants.js";
import { TeacherProjectError } from "../../lib/teacher-project-builder/errors.js";
import { TeacherProjectStore } from "../../lib/teacher-project-builder/store.js";
import { parseTeacherAssetDescriptor } from "../../lib/teacher-project-builder/asset-inspection.js";
import { TeacherProjectJobManager } from "../../lib/teacher-project-builder/jobs.js";
import { BOOK_BUILDER_WRITE_HEADER, ReviewStudioError, equalSessionToken } from "./review-studio-security.mjs";
import { readJsonBody } from "./review-studio-mutation-api.mjs";

const ASSET_FILENAME_HEADER = "x-hhplms-teacher-asset-name";

function requireMethod(request, expected) {
  if (String(request.method || "GET").toUpperCase() !== expected) throw new ReviewStudioError("method_not_allowed", 405);
}

function requireWrite(request, writeEnabled, writeToken) {
  if (!writeEnabled) throw new ReviewStudioError("write_mode_disabled", 403);
  if (!equalSessionToken(request.headers[BOOK_BUILDER_WRITE_HEADER], writeToken)) throw new ReviewStudioError("invalid_write_capability", 401);
}

function exactBody(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReviewStudioError(code, 400);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new ReviewStudioError(code, 400);
  return value;
}

async function readBinaryBody(request, maximumBytes) {
  const contentType = String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/octet-stream") throw new ReviewStudioError("unsupported_content_type", 415);
  const declared = Number(request.headers["content-length"] || 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > maximumBytes) throw new ReviewStudioError("teacher_asset_too_large", 413);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximumBytes) throw new ReviewStudioError("teacher_asset_too_large", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createTeacherProjectDispatcher({ workspace, writeEnabled = false, writeToken = null, store: suppliedStore, jobs: suppliedJobs } = {}) {
  const store = suppliedStore || new TeacherProjectStore({ workspace });
  const jobs = suppliedJobs || new TeacherProjectJobManager({ workspace });

  async function dispatch(request, segments, parsed) {
    if (segments[0] !== "teacher-projects") return null;
    if (segments.length === 3 && segments[1] === "android" && segments[2] === "devices") {
      requireMethod(request, "GET");
      requireWrite(request, writeEnabled, writeToken);
      return { statusCode: 200, payload: await jobs.devices() };
    }
    if (segments.length === 3 && segments[1] === "jobs") {
      requireMethod(request, "GET");
      return { statusCode: 200, payload: { job: jobs.get(segments[2]) } };
    }
    if (segments.length === 1) {
      if (request.method === "GET" || request.method === "HEAD") return { statusCode: 200, payload: await store.list() };
      requireMethod(request, "POST");
      requireWrite(request, writeEnabled, writeToken);
      const body = exactBody(await readJsonBody(request), ["projectId", "displayName"], "invalid_teacher_project_create");
      const project = await store.create(body);
      return { statusCode: 201, payload: { project } };
    }
    const projectId = segments[1];
    if (segments.length === 2) {
      if (request.method === "GET" || request.method === "HEAD") return { statusCode: 200, payload: await store.status(projectId) };
      throw new ReviewStudioError("method_not_allowed", 405);
    }
    if (segments.length === 3 && segments[2] === "save") {
      requireMethod(request, "POST");
      requireWrite(request, writeEnabled, writeToken);
      const body = exactBody(await readJsonBody(request), ["displayName", "expectedRevision", "shell"], "invalid_teacher_project_save");
      const project = await store.save(projectId, body);
      return { statusCode: 200, payload: { project, completeness: (await store.status(projectId)).completeness } };
    }
    if (segments.length === 3 && segments[2] === "duplicate") {
      requireMethod(request, "POST");
      requireWrite(request, writeEnabled, writeToken);
      const body = exactBody(await readJsonBody(request), ["projectId", "displayName"], "invalid_teacher_project_duplicate");
      const project = await store.duplicate(projectId, body);
      return { statusCode: 201, payload: { project } };
    }
    if (segments.length === 3 && segments[2] === "export") {
      requireMethod(request, "POST");
      requireWrite(request, writeEnabled, writeToken);
      const body = exactBody(await readJsonBody(request), ["expectedRevision"], "invalid_teacher_project_export");
      return { statusCode: 202, payload: { job: await jobs.startExport(projectId, body.expectedRevision) } };
    }
    if (segments.length === 3 && segments[2] === "run") {
      requireMethod(request, "POST");
      requireWrite(request, writeEnabled, writeToken);
      const body = exactBody(await readJsonBody(request), ["expectedRevision", "serial"], "invalid_teacher_project_run");
      return { statusCode: 202, payload: { job: await jobs.startRun(projectId, body.expectedRevision, body.serial) } };
    }
    if (segments.length === 4 && segments[2] === "assets" && segments[3] === "import") {
      requireMethod(request, "POST");
      requireWrite(request, writeEnabled, writeToken);
      const descriptor = parseTeacherAssetDescriptor(parsed.searchParams);
      const maximumBytes = descriptor.section === "audio" ? TEACHER_PROJECT_LIMITS.audioBytes
        : descriptor.section === "animation" && descriptor.variant === "gaf" ? TEACHER_PROJECT_LIMITS.gafBytes
          : TEACHER_PROJECT_LIMITS.rasterBytes;
      const bytes = await readBinaryBody(request, maximumBytes);
      const result = await store.importAsset(projectId, {
        bytes,
        descriptor,
        originalFilename: String(request.headers[ASSET_FILENAME_HEADER] || "upload"),
      });
      return { statusCode: 201, payload: result };
    }
    if (segments.length === 5 && segments[2] === "assets" && segments[4] === "content") {
      if (!["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase())) throw new ReviewStudioError("method_not_allowed", 405);
      const content = await store.assetContent(projectId, segments[3]);
      return { statusCode: 200, binary: { buffer: content.bytes, contentType: content.metadata.mediaType } };
    }
    if (segments.length === 5 && segments[2] === "assets" && segments[4] === "remove") {
      requireMethod(request, "POST");
      requireWrite(request, writeEnabled, writeToken);
      const body = exactBody(await readJsonBody(request), ["expectedRevision"], "invalid_teacher_asset_remove");
      const project = await store.removeAsset(projectId, segments[3], body.expectedRevision);
      return { statusCode: 200, payload: { project } };
    }
    throw new ReviewStudioError("route_not_found", 404);
  }

  return { dispatch, store, jobs };
}

export { ASSET_FILENAME_HEADER, readBinaryBody };

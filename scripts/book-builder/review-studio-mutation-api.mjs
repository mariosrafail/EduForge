import { ProjectMutationError } from "../../lib/book-builder/project-mutation-error.js";
import { createProjectMutationService } from "./review-studio-authoring.mjs";
import {
  BOOK_BUILDER_WRITE_HEADER,
  MAXIMUM_MUTATION_BODY_BYTES,
  ReviewStudioError,
  equalSessionToken,
} from "./review-studio-security.mjs";

export async function readJsonBody(request) {
  const contentType = String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new ReviewStudioError("unsupported_content_type", 415);
  const declared = Number(request.headers["content-length"] || 0);
  if (declared > MAXIMUM_MUTATION_BODY_BYTES) throw new ReviewStudioError("mutation_body_too_large", 413);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAXIMUM_MUTATION_BODY_BYTES) throw new ReviewStudioError("mutation_body_too_large", 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ReviewStudioError("invalid_json_body", 400); }
}

function asReviewStudioError(error) {
  if (error instanceof ReviewStudioError) return error;
  if (error instanceof ProjectMutationError) return new ReviewStudioError(error.code, error.statusCode, error.details);
  return new ReviewStudioError("decision_mutation_failed", 500);
}

export function createMutationDispatcher({ writeEnabled, writeToken, workspace, sessionId, getReader, invalidateProject, hooks } = {}) {
  async function dispatch(request, segments) {
    if (segments[0] !== "projects" || segments[2] !== "decisions" || segments.length !== 4) return null;
    if (!writeEnabled) throw new ReviewStudioError("write_mode_disabled", 403);
    if (!equalSessionToken(request.headers[BOOK_BUILDER_WRITE_HEADER], writeToken)) throw new ReviewStudioError("invalid_write_capability", 401);
    if (String(request.method || "").toUpperCase() !== "POST") throw new ReviewStudioError("method_not_allowed", 405);
    const operation = segments[3];
    if (!["preview", "apply", "remove", "reapprove"].includes(operation)) throw new ReviewStudioError("route_not_found", 404);
    const body = await readJsonBody(request);
    try {
      const reader = await getReader();
      const service = await createProjectMutationService({ reader, projectId: segments[1], workspace, sessionId, hooks });
      const result = operation === "preview" ? await service.preview(body)
        : operation === "apply" ? await service.apply(body)
          : operation === "remove" ? await service.remove(body) : await service.reapprove(body);
      if (operation !== "preview") await invalidateProject?.(segments[1]);
      return { statusCode: 200, payload: result };
    } catch (error) { throw asReviewStudioError(error); }
  }
  return { dispatch };
}

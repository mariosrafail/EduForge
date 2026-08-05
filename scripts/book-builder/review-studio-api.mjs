import { randomBytes } from "node:crypto";

import {
  BOOK_BUILDER_API_ROOT,
  BOOK_BUILDER_SESSION_HEADER,
  LOOPBACK_ADDRESSES,
  ReviewStudioError,
  assertSafeResponseBody,
  equalSessionToken,
  isLoopbackHost,
  publicError,
  sameOriginForHost,
} from "./review-studio-security.mjs";
import { createReviewStudioWorkspace } from "./review-studio-workspace.mjs";
import { createMutationDispatcher } from "./review-studio-mutation-api.mjs";
import { decorateDecisionView, decisionsAndHistoryView, invalidateDecisionViewCache } from "./review-studio-decision-view-models.mjs";

function securityHeaders(response, contentType) {
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; sandbox");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function endJson(request, response, statusCode, payload) {
  const serialized = `${JSON.stringify(payload)}\n`;
  assertSafeResponseBody(serialized);
  response.statusCode = statusCode;
  securityHeaders(response, "application/json; charset=utf-8");
  response.setHeader("Content-Length", Buffer.byteLength(serialized));
  response.end(request.method === "HEAD" ? undefined : serialized);
}

function endPreview(request, response, preview) {
  response.statusCode = 200;
  securityHeaders(response, preview.contentType);
  response.setHeader("Content-Length", preview.buffer.length);
  response.end(request.method === "HEAD" ? undefined : preview.buffer);
}

function validateLocalRequest(request) {
  if (!LOOPBACK_ADDRESSES.has(String(request.socket?.remoteAddress || ""))) {
    throw new ReviewStudioError("local_request_required", 403);
  }
  const host = String(request.headers.host || "");
  if (!isLoopbackHost(host)) throw new ReviewStudioError("invalid_host", 403);
  if (!sameOriginForHost(request.headers.origin, host)) throw new ReviewStudioError("invalid_origin", 403);
  return host;
}

function requireReadOnlyMethod(request) {
  if (!["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase())) {
    throw new ReviewStudioError("method_not_allowed", 405);
  }
}

function requireSession(request, sessionToken) {
  if (!equalSessionToken(request.headers[BOOK_BUILDER_SESSION_HEADER], sessionToken)) {
    throw new ReviewStudioError("invalid_session", 401);
  }
}

function pathSegments(pathname) {
  return pathname.slice(BOOK_BUILDER_API_ROOT.length).split("/").filter(Boolean).map((segment) => {
    try { return decodeURIComponent(segment); } catch { throw new ReviewStudioError("invalid_route", 400); }
  });
}

export function createReviewStudioApi({
  workspace,
  sessionToken = randomBytes(32).toString("base64url"),
  writeEnabled = false,
  writeToken = writeEnabled ? randomBytes(32).toString("base64url") : null,
  authoringSessionId = writeEnabled ? randomBytes(24).toString("base64url") : null,
  onArtifactRead,
  mutationHooks,
} = {}) {
  let readerPromise;
  const reader = () => {
    readerPromise ||= createReviewStudioWorkspace({ workspace, onArtifactRead });
    return readerPromise;
  };
  const mutationDispatcher = createMutationDispatcher({
    writeEnabled,
    writeToken,
    workspace,
    sessionId: authoringSessionId,
    getReader: reader,
    hooks: mutationHooks,
    invalidateProject: async (projectId) => invalidateDecisionViewCache(await reader(), projectId),
  });

  async function dispatch(request, response) {
    const parsed = new URL(request.url || "/", "http://127.0.0.1");
    if (!parsed.pathname.startsWith(BOOK_BUILDER_API_ROOT)) return false;
    try {
      validateLocalRequest(request);
      const segments = pathSegments(parsed.pathname);
      if (segments.length === 1 && segments[0] === "bootstrap") {
        requireReadOnlyMethod(request);
        const current = await reader();
        endJson(request, response, 200, {
          apiRoot: BOOK_BUILDER_API_ROOT,
          readOnly: !writeEnabled,
          writeEnabled,
          milestone: "4B2A",
          sessionToken,
          ...(writeEnabled ? { writeCapability: writeToken } : {}),
          workspaceLabel: current.workspaceLabel,
        });
        return true;
      }
      const isDecisionMutation = segments[0] === "projects" && segments[2] === "decisions" && segments.length === 4;
      if (isDecisionMutation && !writeEnabled) throw new ReviewStudioError("write_mode_disabled", 403);
      requireSession(request, sessionToken);
      if (isDecisionMutation) {
        const mutation = await mutationDispatcher.dispatch(request, segments);
        endJson(request, response, mutation.statusCode, mutation.payload);
        return true;
      }
      requireReadOnlyMethod(request);
      const current = await reader();
      if (segments.length === 1 && segments[0] === "projects") {
        endJson(request, response, 200, await current.listProjects());
        return true;
      }
      if (segments[0] !== "projects" || segments.length < 3) throw new ReviewStudioError("route_not_found", 404);
      const [, projectId, view, detail] = segments;
      let payload;
      if (view === "overview" && !detail) payload = await current.overview(projectId);
      else if (view === "components" && !detail) payload = await current.components(projectId, parsed.searchParams);
      else if (view === "pages" && !detail) payload = await current.pages(projectId, parsed.searchParams);
      else if (view === "menu" && !detail) payload = await current.menu(projectId);
      else if (view === "activities" && !detail) payload = await current.activities(projectId, parsed.searchParams);
      else if (view === "reviews" && !detail) payload = await current.reviews(projectId, parsed.searchParams);
      else if (view === "diff" && !detail) payload = await current.diff(projectId, parsed.searchParams);
      else if (view === "decisions" && !detail) payload = await decisionsAndHistoryView(current, projectId);
      else if (view === "preview" && detail && segments.length === 4) {
        endPreview(request, response, await current.preview(projectId, detail));
        return true;
      } else throw new ReviewStudioError("route_not_found", 404);
      endJson(request, response, 200, await decorateDecisionView(current, projectId, view, payload));
      return true;
    } catch (cause) {
      const error = publicError(cause);
      try { endJson(request, response, error.statusCode, { error: { code: error.code, message: error.code.replaceAll("_", " "), ...(error.details ? { details: error.details } : {}) } }); }
      catch { response.statusCode = 500; securityHeaders(response, "application/json; charset=utf-8"); response.end('{"error":{"code":"review_studio_request_failed","message":"review studio request failed"}}\n'); }
      return true;
    }
  }

  return { dispatch, sessionToken, writeToken, writeEnabled, reader };
}

export function bookBuilderReviewStudioPlugin(options) {
  const api = createReviewStudioApi(options);
  return {
    name: "hhplms-book-builder-review-studio",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!String(request.url || "").startsWith(BOOK_BUILDER_API_ROOT)) return next();
        await api.dispatch(request, response);
      });
    },
  };
}

export { validateLocalRequest };

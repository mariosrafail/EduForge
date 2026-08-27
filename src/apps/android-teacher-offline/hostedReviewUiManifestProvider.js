import { normalizeHostedTeacherUiPreview } from "../../data/ultimate-b2/hostedTeacherUiDocument.js";
import { HOSTED_VIEWER_RUNTIME_MODES, authorizedHostedPreviewPath, hostedReleasePath, resolveHostedViewerRuntimeContext } from "./hostedReleasePreview.js";

const previewPath = "/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/ui-controller";

export const interactiveUiManifestProvider = Object.freeze({
  async load({ runtimeContext = resolveHostedViewerRuntimeContext(), fetchImpl = globalThis.fetch, signal } = {}) {
    const context = runtimeContext;
    if (context.kind === HOSTED_VIEWER_RUNTIME_MODES.BARE) return null;
    if (!context.teacherPreview) {
      const error = new Error("The requested Viewer preview context is invalid.");
      error.code = "LIVE_PREVIEW_UNAVAILABLE";
      throw error;
    }
    const response = await fetchImpl(context.kind === HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW
      ? hostedReleasePath(context.releaseId, "teacher-ui")
      : authorizedHostedPreviewPath(previewPath, context.authorization), { method: "GET", cache: "no-store", credentials: "omit", signal });
    if (response.status === 404) return null;
    if (!response.ok) {
      const error = new Error("The saved Teacher interface revision could not be loaded.");
      error.code = "LIVE_PREVIEW_UNAVAILABLE";
      throw error;
    }
    const payload = await response.json();
    return normalizeHostedTeacherUiPreview(payload?.document);
  },
});

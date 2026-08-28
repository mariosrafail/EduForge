import { HOSTED_VIEWER_RUNTIME_MODES, hostedReleasePath, resolveHostedViewerRuntimeContext } from "./hostedReleasePreview.js";

const SAFE_ACTIVITY_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;

export async function getOfflineTeacherSolution(activityId) {
  const context = resolveHostedViewerRuntimeContext();
  const normalizedActivityId = String(activityId || "");
  if (context.kind !== HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW || !SAFE_ACTIVITY_ID.test(normalizedActivityId)) return null;
  const response = await fetch(hostedReleasePath(context, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" }, `teacher-solution/${normalizedActivityId}`), {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Prepared Teacher solution is unavailable.");
  const payload = await response.json();
  if (payload?.releaseId !== context.releaseId || payload?.activityId !== normalizedActivityId) throw new Error("Prepared Teacher solution identity mismatch.");
  return payload.document || null;
}

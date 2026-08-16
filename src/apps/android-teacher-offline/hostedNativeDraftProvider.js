import { useEffect, useState } from "react";

import { normalizeNativeRuntimePublicDocument, normalizeNativeRuntimeTeacherDocument } from "../../data/native-activities/nativeActivityRuntimeValidation.js";
import { HOSTED_VIEWER_RUNTIME_MODES, authorizedHostedPreviewPath, resolveHostedViewerRuntimeContext } from "./hostedReleasePreview.js";

const BOOK_SLUG = "ultimate-b2";
const COMPONENT_SLUG = "ultimate-b2-students-book";
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function exactObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has unsupported fields.`);
}

function nativeDraftPath(activityId, suffix, authorization) {
  if (!SAFE_ID.test(String(activityId || "")) || !/^(?:public|teacher|assets\/[0-9a-f-]{36})$/i.test(suffix)) throw new Error("Invalid native draft preview path.");
  return authorizedHostedPreviewPath(`/preview/native-activities/books/${BOOK_SLUG}/components/${COMPONENT_SLUG}/activities/${activityId}/${suffix}`, authorization);
}

function normalizeEnvelope(value, { activityId, audience, publicDocument = null }) {
  exactObject(value, ["bookSlug", "componentSlug", "activityId", "kind", "audience", "schemaVersion", "revision", "document"], "Native draft envelope");
  if (value.bookSlug !== BOOK_SLUG || value.componentSlug !== COMPONENT_SLUG || value.activityId !== activityId || value.audience !== audience
    || value.schemaVersion !== "1.0" || !Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error("Native draft envelope identity is invalid.");
  const document = audience === "public"
    ? normalizeNativeRuntimePublicDocument(value.document, { activityId, kind: value.kind })
    : normalizeNativeRuntimeTeacherDocument(value.document, { activityId, kind: value.kind, publicDocument });
  if (document.schemaVersion !== value.schemaVersion) throw new Error("Native draft envelope schema is inconsistent.");
  return { kind: value.kind, revision: value.revision, document };
}

async function fetchEnvelope(path, { fetchImpl = fetch, signal } = {}) {
  const response = await fetchImpl(path, { method: "GET", credentials: "omit", cache: "no-store", signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Native draft preview is unavailable.");
  return response.json();
}

export async function loadHostedNativeDraftPublicActivity(activityId, { context = resolveHostedViewerRuntimeContext(), fetchImpl = fetch, signal } = {}) {
  if (context.kind !== HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW || !SAFE_ID.test(String(activityId || ""))) return null;
  const payload = await fetchEnvelope(nativeDraftPath(activityId, "public", context.authorization), { fetchImpl, signal });
  return payload ? normalizeEnvelope(payload, { activityId, audience: "public" }) : null;
}

export async function loadHostedNativeDraftTeacherActivity(publicEntry, { context = resolveHostedViewerRuntimeContext(), fetchImpl = fetch, signal } = {}) {
  if (context.kind !== HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW || !["open-response", "single-choice"].includes(publicEntry?.kind)) return null;
  const activityId = publicEntry.document.activityId;
  const payload = await fetchEnvelope(nativeDraftPath(activityId, "teacher", context.authorization), { fetchImpl, signal });
  if (!payload) throw new Error("Native Teacher draft is unavailable.");
  return normalizeEnvelope(payload, { activityId, audience: "teacher", publicDocument: publicEntry.document });
}

export function shouldLoadHostedNativeDraftTeacherActivity(publicEntry, teacherMode) {
  return Boolean(teacherMode && ["open-response", "single-choice"].includes(publicEntry?.kind));
}

export function hostedNativeDraftAssetUrl(activityId, assetId, context = resolveHostedViewerRuntimeContext()) {
  if (context.kind !== HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW || !UUID.test(String(assetId || ""))) return "";
  return nativeDraftPath(activityId, `assets/${String(assetId).toLowerCase()}`, context.authorization);
}

export function useHostedNativeDraftActivity(activityId, { teacherMode = false } = {}) {
  const context = resolveHostedViewerRuntimeContext();
  const contextKey = `${context.kind}:${context.authorization || ""}:${context.releaseId || ""}`;
  const [state, setState] = useState({ activityId: null, kind: "idle", entry: null, teacher: { kind: "idle", entry: null } });
  useEffect(() => {
    setState({ activityId, kind: "idle", entry: null, teacher: { kind: "idle", entry: null } });
    if (context.kind !== HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW || !SAFE_ID.test(String(activityId || ""))) return undefined;
    const controller = new AbortController();
    setState({ activityId, kind: "loading", entry: null, teacher: { kind: "idle", entry: null } });
    loadHostedNativeDraftPublicActivity(activityId, { context, signal: controller.signal })
      .then((entry) => {
        if (controller.signal.aborted) return;
        if (!entry) { setState({ activityId, kind: "unavailable", entry: null, teacher: { kind: "idle", entry: null } }); return; }
        if (!shouldLoadHostedNativeDraftTeacherActivity(entry, teacherMode)) { setState({ activityId, kind: "ready", entry, teacher: { kind: "idle", entry: null } }); return; }
        setState({ activityId, kind: "ready", entry, teacher: { kind: "loading", entry: null } });
        loadHostedNativeDraftTeacherActivity(entry, { context, signal: controller.signal })
          .then((teacher) => { if (!controller.signal.aborted) setState({ activityId, kind: "ready", entry, teacher: { kind: "ready", entry: teacher } }); })
          .catch(() => { if (!controller.signal.aborted) setState({ activityId, kind: "ready", entry, teacher: { kind: "error", entry: null } }); });
      })
      .catch(() => { if (!controller.signal.aborted) setState({ activityId, kind: "error", entry: null, teacher: { kind: "idle", entry: null } }); });
    return () => controller.abort();
  }, [activityId, contextKey, teacherMode]);
  return state.activityId === activityId ? state : { activityId, kind: context.kind === HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW && activityId ? "loading" : "idle", entry: null, teacher: { kind: "idle", entry: null } };
}

export { nativeDraftPath as hostedNativeDraftPath, normalizeEnvelope as normalizeHostedNativeDraftEnvelope };

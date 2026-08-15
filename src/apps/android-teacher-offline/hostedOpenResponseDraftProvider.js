import { useEffect, useState } from "react";

import { ULTIMATE_B2_HOSTED_OPEN_RESPONSE_SCHEMA_VERSION } from "../../data/ultimate-b2/hostedOpenResponseDraft.js";
import { isUltimateB2ConfigurableOpenResponse } from "../../data/ultimate-b2/openResponseActivityRegistry.js";
import {
  hostedTeacherImportAsSolution,
  normalizeUltimateB2HostedOpenResponseImport,
  normalizeUltimateB2HostedOpenResponseTeacherImport,
} from "../../data/ultimate-b2/hostedOpenResponseImport.js";
import { HOSTED_VIEWER_RUNTIME_MODES, authorizedHostedPreviewPath, hostedReleasePath, resolveHostedViewerRuntimeContext } from "./hostedReleasePreview.js";
import { createUltimateB2HostedOpenResponseSeed } from "../../data/ultimate-b2/hostedOpenResponseDraft.js";
import { hydrateUltimateB2ReleaseImport } from "../../data/ultimate-b2/componentPublication.js";
import { findStudentsBookImplementation } from "../../data/ultimate-b2/studentsBookCatalog.js";

const routeRoot = "/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/open-response";

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function validateHostedOpenResponsePreviewEnvelope(value, activityId) {
  if (!exactKeys(value, ["bookSlug", "componentSlug", "resource", "documentKey", "schemaVersion", "revision", "source", "document"])) throw new Error("Invalid hosted Open Response preview envelope.");
  if (value.bookSlug !== "ultimate-b2" || value.componentSlug !== "ultimate-b2-students-book" || value.resource !== "open-response" || value.documentKey !== activityId) throw new Error("Hosted Open Response preview identity mismatch.");
  if (value.schemaVersion !== ULTIMATE_B2_HOSTED_OPEN_RESPONSE_SCHEMA_VERSION || value.source !== "database" || !Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error("Hosted Open Response preview revision is invalid.");
  if (!value.document || typeof value.document !== "object" || Array.isArray(value.document)) throw new Error("Hosted Open Response preview document is invalid.");
  return value.document;
}

export function useHostedOpenResponseDraft(activityId) {
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    setDraft(null);
    if (!isUltimateB2ConfigurableOpenResponse(activityId)) return undefined;
    const context = resolveHostedViewerRuntimeContext();
    if (!context.teacherPreview) return undefined;
    const controller = new AbortController();
    fetch(context.kind === HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW ? hostedReleasePath(context.releaseId, "public") : `${routeRoot}/${encodeURIComponent(activityId)}`, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Hosted Open Response preview is unavailable.");
      const payload = await response.json();
      return context.kind === HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW ? payload?.projection?.activities?.[activityId]?.authoring || null : validateHostedOpenResponsePreviewEnvelope(payload, activityId);
    }).then((document) => {
      if (!controller.signal.aborted) setDraft(document);
    }).catch(() => {
      if (!controller.signal.aborted) setDraft(null);
    });
    return () => controller.abort();
  }, [activityId]);

  return draft;
}

function validateImportEnvelope(value, activityId, kind) {
  if (!exactKeys(value, ["activityId", "revision", "fingerprint", "document"]) || value.activityId !== activityId || !Number.isSafeInteger(value.revision) || value.revision < 1 || !/^[a-f0-9]{64}$/.test(value.fingerprint)) throw new Error("Invalid hosted Open Response import envelope.");
  return kind === "public"
    ? normalizeUltimateB2HostedOpenResponseImport(value.document, activityId)
    : normalizeUltimateB2HostedOpenResponseTeacherImport(value.document, activityId);
}

export function useHostedOpenResponseImport(activityId) {
  const [state, setState] = useState({ publicImport: null, teacherSolution: null, revision: 0 });
  useEffect(() => {
    setState({ publicImport: null, teacherSolution: null, revision: 0 });
    if (!isUltimateB2ConfigurableOpenResponse(activityId)) return undefined;
    const context = resolveHostedViewerRuntimeContext();
    if (!context.teacherPreview) return undefined;
    const controller = new AbortController();
    if (context.kind === HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW) {
      Promise.all([
        fetch(hostedReleasePath(context.releaseId, "public"), { method: "GET", credentials: "omit", cache: "no-store", signal: controller.signal }).then(async (response) => {
          if (!response.ok) return null;
          const imported = (await response.json())?.projection?.activities?.[activityId]?.import || null;
          if (!imported) return null;
          const seed = createUltimateB2HostedOpenResponseSeed(findStudentsBookImplementation(activityId));
          return hydrateUltimateB2ReleaseImport(imported, activityId, seed.questions.map((question) => question.id), (asset) => hostedReleasePath(context.releaseId, `assets/${asset.sha256}.${asset.extension}`));
        }),
        fetch(hostedReleasePath(context.releaseId, `teacher-solution/${activityId}`), { method: "GET", credentials: "omit", cache: "no-store", signal: controller.signal }).then(async (response) => response.status === 404 ? null : response.ok ? (await response.json()).document : Promise.reject(new Error("Release solution unavailable"))),
      ]).then(([publicImport, teacher]) => {
        if (!controller.signal.aborted) setState({ publicImport, teacherSolution: hostedTeacherImportAsSolution(teacher, activityId), revision: 0 });
      }).catch(() => { if (!controller.signal.aborted) setState({ publicImport: null, teacherSolution: null, revision: 0 }); });
      return () => controller.abort();
    }
    const fetchProjection = async (kind) => {
      const path = `/preview/open-response-${kind === "public" ? "import" : "teacher"}/${encodeURIComponent(activityId)}`;
      const response = await fetch(kind === "teacher" ? authorizedHostedPreviewPath(path, context.authorization) : path, { method: "GET", credentials: "omit", cache: "no-store", signal: controller.signal });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Hosted Open Response import preview is unavailable.");
      const envelope = await response.json();
      return { document: validateImportEnvelope(envelope, activityId, kind), revision: envelope.revision };
    };
    Promise.all([fetchProjection("public"), fetchProjection("teacher")]).then(([publicValue, teacherValue]) => {
      if (controller.signal.aborted || !publicValue || !teacherValue || publicValue.revision !== teacherValue.revision) return;
      setState({ publicImport: publicValue.document, teacherSolution: hostedTeacherImportAsSolution(teacherValue.document, activityId), revision: publicValue.revision });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ publicImport: null, teacherSolution: null, revision: 0 });
    });
    return () => controller.abort();
  }, [activityId]);
  return state;
}

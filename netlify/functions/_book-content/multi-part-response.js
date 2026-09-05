import { projectNativeMultiPartChild } from "../../../src/data/native-activities/nativeMultiPart.js";

export const NATIVE_MULTI_RESPONSE_SCHEMA = "native-multi-response.v1";
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");

export function multiPartAssignmentCapability(document, resolve) {
  const children = (document?.parts[0].interaction.sections || []).filter((section) => section.kind !== "image");
  const automatic = children.length > 0 && children.every((section) => resolve(section.kind, projectNativeMultiPartChild(document, section).publicDocument)?.reviewMode === "auto-scored");
  return Object.freeze({ kind: "multi-part", assignable: children.length > 0, submittable: children.length > 0, reviewMode: automatic ? "auto-scored" : "teacher-reviewed", responseSchemaVersion: NATIVE_MULTI_RESPONSE_SCHEMA,
    normalizeResponse(publicDocument, raw) {
      if (!exact(raw, ["schemaVersion", "sections"]) || raw.schemaVersion !== NATIVE_MULTI_RESPONSE_SCHEMA || !Array.isArray(raw.sections) || raw.sections.length > 24) return { error: "Invalid Multi-Part response envelope" };
      if (Buffer.byteLength(JSON.stringify(raw), "utf8") > 100000) return { error: "Multi-Part response payload is too large" };
      const byId = new Map();
      for (const value of raw.sections) {
        if (!exact(value, ["id", "kind", "response"]) || byId.has(value.id) || !children.some((section) => section.id === value.id && section.kind === value.kind)) return { error: "Unknown, duplicate or mismatched Multi-Part response section" };
        byId.set(value.id, value);
      }
      const sections = [];
      for (const section of children) {
        const child = projectNativeMultiPartChild(publicDocument, section);
        const capability = resolve(section.kind, child.publicDocument);
        const response = byId.get(section.id)?.response || { schemaVersion: capability.responseSchemaVersion, items: [] };
        const normalized = capability.normalizeResponse(child.publicDocument, response);
        if (normalized.error) return { error: `${section.id}: ${normalized.error}` };
        sections.push({ id: section.id, kind: section.kind, response: normalized.payload });
      }
      return { schemaVersion: NATIVE_MULTI_RESPONSE_SCHEMA, payload: { schemaVersion: NATIVE_MULTI_RESPONSE_SCHEMA, kind: "multi-part", sections } };
    },
    evaluateResponse(publicDocument, teacherDocument, payload) {
      const sectionResults = children.map((section) => {
        const child = projectNativeMultiPartChild(publicDocument, section, teacherDocument);
        const capability = resolve(section.kind, child.publicDocument);
        const response = payload.sections.find((entry) => entry.id === section.id)?.response || { items: [] };
        const result = capability.evaluateResponse?.(child.publicDocument, child.teacherDocument, response) || { status: "awaiting_review", correctCount: null, totalCount: null, scorePercent: null };
        return { sectionId: section.id, kind: section.kind, ...result };
      });
      const automaticResults = sectionResults.filter((result) => result.status !== "awaiting_review");
      const correctCount = automaticResults.reduce((sum, result) => sum + result.correctCount, 0);
      const totalCount = automaticResults.reduce((sum, result) => sum + result.totalCount, 0);
      return { status: automatic ? "submitted" : "awaiting_review", correctCount, totalCount, scorePercent: automatic && totalCount ? Math.round(100 * correctCount / totalCount) : null, sectionResults };
    },
    teacherReviewProjection(publicDocument, teacherDocument, payload) {
      return children.flatMap((section) => {
        const child = projectNativeMultiPartChild(publicDocument, section, teacherDocument);
        const response = payload.sections?.find((entry) => entry.id === section.id)?.response || { items: [] };
        return resolve(section.kind, child.publicDocument).teacherReviewProjection(child.publicDocument, child.teacherDocument, response).map((detail) => ({ ...detail, sectionId: section.id, sectionKind: section.kind, questionId: `${section.id}/${detail.questionId}`, prompt: `${section.title || section.kind}: ${detail.prompt || ""}` }));
      });
    },
  });
}

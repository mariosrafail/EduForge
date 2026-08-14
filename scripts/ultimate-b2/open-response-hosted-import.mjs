import { createHash } from "node:crypto";
import path from "node:path";

import {
  normalizeUltimateB2HostedOpenResponseImport,
  normalizeUltimateB2HostedOpenResponseTeacherImport,
  ULTIMATE_B2_HOSTED_OPEN_RESPONSE_IMPORT_SCHEMA_VERSION,
  ULTIMATE_B2_HOSTED_OPEN_RESPONSE_TEACHER_SCHEMA_VERSION,
} from "../../src/data/ultimate-b2/hostedOpenResponseImport.js";
import { importUltimateB2OpenResponsePublisherBundle } from "./open-response-publisher-importer.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stableJson = (value) => Array.isArray(value)
  ? `[${value.map(stableJson).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`
    : JSON.stringify(value);

function hostedExtension(repositoryPath) {
  const extension = path.extname(repositoryPath).toLowerCase();
  if (![".png", ".jpg", ".webp"].includes(extension)) throw new Error("Imported raster extension is unsupported for hosted review.");
  return extension;
}

export async function importUltimateB2HostedOpenResponseBundle({ activityId, files, expectedQuestionIds, assetPathFor }) {
  if (typeof assetPathFor !== "function") throw new Error("Hosted Open Response import requires a public asset projection.");
  const imported = await importUltimateB2OpenResponsePublisherBundle({ activityId, files });
  if (imported.report.unreferencedImages.length) throw new Error("Hosted source bundle contains unexpected unreferenced raster files.");
  if (!Array.isArray(expectedQuestionIds) || imported.publicAuthoring.questions.length !== expectedQuestionIds.length) throw new Error("Publisher source question topology does not match the selected activity.");
  imported.publicAuthoring.questions.forEach((question, index) => {
    if (question.id !== expectedQuestionIds[index]) throw new Error("Publisher source question identity does not match the selected activity.");
  });

  const publicProjection = normalizeUltimateB2HostedOpenResponseImport({
    schemaVersion: ULTIMATE_B2_HOSTED_OPEN_RESPONSE_IMPORT_SCHEMA_VERSION,
    activityId,
    surface: imported.publicAuthoring.surface,
    visualCapabilities: imported.publicAuthoring.visualCapabilities,
    artworkLayers: imported.publicAuthoring.artworkLayers.map((layer) => ({
      id: layer.id,
      binding: layer.binding,
      assetPath: assetPathFor(layer.sha256, hostedExtension(layer.repositoryPath)),
      sha256: layer.sha256,
      naturalSize: layer.naturalSize,
      area: layer.area,
      order: layer.order,
      altText: layer.altText,
      accessibilityStatus: layer.accessibilityStatus,
    })),
    questions: imported.publicAuthoring.questions,
  }, activityId, expectedQuestionIds);
  const teacherProjection = normalizeUltimateB2HostedOpenResponseTeacherImport({
    schemaVersion: ULTIMATE_B2_HOSTED_OPEN_RESPONSE_TEACHER_SCHEMA_VERSION,
    activityId,
    answers: imported.teacherAuthoring.modelAnswers.map((answer) => ({ questionId: answer.questionId, text: answer.text })),
  }, activityId, expectedQuestionIds);
  const sources = files.map((file) => ({ name: file.name, sha256: sha256(file.bytes), byteSize: file.bytes.length }))
    .sort((left, right) => left.name.toLowerCase().localeCompare(right.name.toLowerCase()));
  const fingerprint = sha256(Buffer.from(stableJson({ importer: "ultimate-b2-open-response-publisher-v1", activityId, sources }), "utf8"));
  return { ...imported, publicProjection, teacherProjection, sources, fingerprint };
}

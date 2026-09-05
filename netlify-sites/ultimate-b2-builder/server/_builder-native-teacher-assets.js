import { createHash } from "node:crypto";
import { nativeTeacherAnswerImages, NATIVE_TEACHER_ANSWER_ASSET_ROLE } from "../../../src/data/native-activities/nativeImageSampleAnswer.js";

export async function builderTeacherAnswerAssetsReady(sql) {
  const rows = await sql`select to_regprocedure('builder_native_teacher_answer_assets_version()') is not null as ready`;
  return rows[0]?.ready === true;
}

export async function validateTeacherImageDraftAssets(dependencies, sql, identity, teacherDocument) {
  const images = nativeTeacherAnswerImages(teacherDocument);
  if (!images.length) return;
  if (!await dependencies.teacherAssetsReady(sql)) throw new Error("protected_teacher_assets_unavailable");
  await dependencies.validateAssets(sql, { ...identity, assets: images.map((image) => image.reference), requirements: images.map((image) => ({ slot: image.reference.slot, width: image.sourceWidth, height: image.sourceHeight, mediaType: image.mediaType, label: "Protected Sample answer" })) });
}

export async function serveProtectedNativeAnswer({ storage, asset, method = "GET" }) {
  if (asset.asset_role !== NATIVE_TEACHER_ANSWER_ASSET_ROLE || asset.storage_profile !== "private" || !["image/png", "image/jpeg", "image/webp"].includes(asset.mime_type) || !["GET", "HEAD"].includes(method)) throw new Error("protected_answer_access_denied");
  const size = Number(asset.byte_size);
  if (!Number.isSafeInteger(size) || size < 1 || size > 10 * 1024 * 1024) throw new Error("protected_answer_integrity_failed");
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "Content-Type": asset.mime_type, "Content-Length": String(size), "Cross-Origin-Resource-Policy": "same-origin", "X-Content-Type-Options": "nosniff" };
  if (method === "HEAD") return { statusCode: 200, headers, body: "" };
  const bytes = Buffer.from(await storage.download({ profile: "private", objectKey: asset.object_key }));
  if (bytes.length !== size || createHash("sha256").update(bytes).digest("hex") !== asset.checksum_sha256) throw new Error("protected_answer_integrity_failed");
  return { statusCode: 200, headers, body: bytes.toString("base64"), isBase64Encoded: true };
}

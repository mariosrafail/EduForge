import { normalizeNativeManagedAssetReference } from "./nativeActivityPublic.js";
import { normalizeNativePedagogicalText } from "./nativePedagogicalText.js";

export const NATIVE_TEACHER_ANSWER_ASSET_ROLE = "native_teacher_answer";

export function usesNativeComposition(document, teacher) {
  return document.kind === "multi-part" || Boolean(document.parts[0].interaction.questionSurface) || Boolean(document.parts[0].interaction.words?.some((word) => word.image)) || Boolean(teacher?.parts[0].solution.sampleAnswer);
}

export function normalizeNativeImageSampleAnswer(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "enabled,image" || typeof value.enabled !== "boolean") throw new Error("Image Sample answer configuration is invalid.");
  if (value.image === null) return { enabled: value.enabled, image: null };
  const image = value.image;
  if (!image || typeof image !== "object" || Array.isArray(image) || Object.keys(image).sort().join(",") !== "altText,mediaType,reference,sourceHeight,sourceWidth") throw new Error("Image Sample answer descriptor is invalid.");
  if (!["image/png", "image/jpeg", "image/webp"].includes(image.mediaType)) throw new Error("Sample answers must be managed raster images.");
  const reference = normalizeNativeManagedAssetReference(image.reference);
  if (reference.role !== NATIVE_TEACHER_ANSWER_ASSET_ROLE) throw new Error("Sample answers require a protected Teacher image.");
  if (![image.sourceWidth, image.sourceHeight].every((size) => Number.isSafeInteger(size) && size >= 1 && size <= 8192)) throw new Error("Image Sample answer dimensions are invalid.");
  return { enabled: value.enabled, image: { reference, mediaType: image.mediaType, sourceWidth: image.sourceWidth, sourceHeight: image.sourceHeight, altText: normalizeNativePedagogicalText(image.altText, "Sample answer accessible description", 2000, { required: true }) } };
}

export function nativeTeacherAnswerImages(teacherDocument) {
  const solution = teacherDocument?.parts?.[0]?.solution;
  if (solution?.kind === "image") return solution.sampleAnswer?.image ? [{ sectionId: null, ...solution.sampleAnswer.image }] : [];
  if (solution?.kind === "multi-part") return (solution.sections || []).flatMap((section) => section.kind === "image" && section.solution?.sampleAnswer?.image ? [{ sectionId: section.id, ...section.solution.sampleAnswer.image }] : []);
  return [];
}

export function nativeTeacherAnswerAssetDescriptors(teacherDocument) {
  return nativeTeacherAnswerImages(teacherDocument).map((image) => ({ sha256: image.reference.checksumSha256, extension: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[image.mediaType], mediaType: image.mediaType, role: NATIVE_TEACHER_ANSWER_ASSET_ROLE }));
}

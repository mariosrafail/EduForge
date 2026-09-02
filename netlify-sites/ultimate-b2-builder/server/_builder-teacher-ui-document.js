import { HOSTED_TEACHER_UI_PACKAGE_ID } from "../../../src/data/ultimate-b2/hostedTeacherUiBindingCatalog.js";
import {
  createEmptyHostedTeacherUiDocument,
  normalizeHostedTeacherUiDocument,
  projectHostedTeacherUiPreview,
} from "../../../src/data/ultimate-b2/hostedTeacherUiDocument.js";

function expectedPackageId(value) {
  const packageId = String(value || "");
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(packageId)) throw new Error("Unsupported hosted Teacher UI document identity.");
  return packageId;
}

function asCanonicalIdentity(candidate, packageId) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || candidate.packageId !== packageId) {
    throw new Error("Unsupported hosted Teacher UI document identity.");
  }
  return { ...candidate, packageId: HOSTED_TEACHER_UI_PACKAGE_ID };
}

function restoreIdentity(candidate, packageId) {
  return Object.freeze({ ...candidate, packageId });
}

export function createEmptyBuilderTeacherUiDocument(packageIdValue) {
  const packageId = expectedPackageId(packageIdValue);
  return restoreIdentity(createEmptyHostedTeacherUiDocument(), packageId);
}

export function normalizeBuilderTeacherUiDocument(candidate, packageIdValue) {
  const packageId = expectedPackageId(packageIdValue);
  return restoreIdentity(normalizeHostedTeacherUiDocument(asCanonicalIdentity(candidate, packageId)), packageId);
}

export function projectBuilderTeacherUiPreview(candidate, packageIdValue) {
  const packageId = expectedPackageId(packageIdValue);
  return restoreIdentity(projectHostedTeacherUiPreview(asCanonicalIdentity(candidate, packageId)), packageId);
}

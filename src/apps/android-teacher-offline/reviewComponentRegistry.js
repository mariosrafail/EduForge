import { bookProductCatalog, findProductComponent } from "../../data/bookProductCatalog.js";
import { ultimateB2StudentsBookPageUnits } from "../../data/ultimate-b2/ultimateB2PageUnits.js";
import {
  interactiveContentPackProvider,
  interactiveStartupAssets,
  interactiveUiManifestProvider,
} from "virtual:ultimate-b2-interactive-pack-provider";
import {
  getUltimateB2AuthoredHotspotActivityKey,
  getUltimateB2StudentsBookHotspotActions,
  prepareUltimateB2StudentsBookHotspots,
} from "virtual:ultimate-b2-runtime-hotspots";
import { getOfflineTeacherSolution } from "virtual:teacher-offline-solutions";
import { createReviewComponentRegistry } from "./reviewComponentRegistryCore.js";
import { createManagedReviewDescriptor } from "virtual:managed-review-runtime";

const DEFAULT_IDENTITY = Object.freeze({
  bookSlug: "ultimate-b2",
  componentSlug: "ultimate-b2-students-book",
});

const studentsBookRuntime = {
  ...DEFAULT_IDENTITY,
  contentPackProvider: interactiveContentPackProvider,
  pageUnits: ultimateB2StudentsBookPageUnits,
  hotspotProvider: Object.freeze({
    prepare: prepareUltimateB2StudentsBookHotspots,
    getActions: getUltimateB2StudentsBookHotspotActions,
    getActivityKey: getUltimateB2AuthoredHotspotActivityKey,
  }),
  solutionProvider: Object.freeze({ get: getOfflineTeacherSolution }),
  startupAssets: interactiveStartupAssets,
  uiManifestProvider: interactiveUiManifestProvider,
};

const HOSTED_MANAGED_IDENTITIES = Object.freeze([
  Object.freeze({ bookSlug: "ultimate-b1", componentSlug: "ultimate-b1-students-book" }),
  Object.freeze({ bookSlug: "ultimate-b1", componentSlug: "ultimate-b1-workbook" }),
  Object.freeze({ bookSlug: "ultimate-b1", componentSlug: "ultimate-b1-grammar-book" }),
  Object.freeze({ bookSlug: "ultimate-b1-plus", componentSlug: "ultimate-b1-plus-students-book" }),
  Object.freeze({ bookSlug: "ultimate-b1-plus", componentSlug: "ultimate-b1-plus-workbook" }),
  Object.freeze({ bookSlug: "ultimate-b1-plus", componentSlug: "ultimate-b1-plus-grammar-book" }),
  Object.freeze({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook" }),
  Object.freeze({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-grammar-book" }),
]);

const hostedManagedRuntimes = interactiveStartupAssets.hosted
  ? HOSTED_MANAGED_IDENTITIES.map(createManagedReviewDescriptor)
  : [];

export const reviewComponentRegistry = createReviewComponentRegistry(bookProductCatalog, [studentsBookRuntime, ...hostedManagedRuntimes], DEFAULT_IDENTITY);

export function resolveReviewComponent(bookSlug, componentSlug, registry = reviewComponentRegistry) {
  return registry.resolve(bookSlug, componentSlug);
}

export function getDefaultReviewComponent(registry = reviewComponentRegistry) {
  const { bookSlug, componentSlug } = registry.defaultIdentity;
  const resolved = registry.resolve(bookSlug, componentSlug);
  if (resolved.kind !== "installed") throw new Error("The default Teacher Review component is not installed.");
  return resolved.runtime;
}

export function resolveTeacherEditionComponent(bookSlug, teacherEditionId, registry = reviewComponentRegistry) {
  const component = bookProductCatalog.find((book) => book.slug === bookSlug)
    ?.components.find((item) => item.teacherEditionId === teacherEditionId) || null;
  return component ? registry.resolve(bookSlug, component.slug) : Object.freeze({ kind: "unknown", bookSlug, componentSlug: "" });
}

export function assertNoCrossComponentResource({ bookSlug, componentSlug, expectedBookSlug, expectedComponentSlug }) {
  return bookSlug === expectedBookSlug && componentSlug === expectedComponentSlug;
}

export { findProductComponent };

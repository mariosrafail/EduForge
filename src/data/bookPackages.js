import { englishJourney6Package } from "./englishJourney6DemoData.js";
import { ultimateB2Package } from "./ultimateB2DemoData.js";

export const demoBookPackages = [ultimateB2Package, englishJourney6Package];

export function getDemoBookPackage(slugOrId = "ultimate-b2") {
  return demoBookPackages.find((bookPackage) => (
    bookPackage.slug === slugOrId ||
    bookPackage.id === slugOrId ||
    bookPackage.packageTitle === slugOrId
  )) || ultimateB2Package;
}

function normalizeMatchKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function componentMatchKeys(component = {}) {
  return [
    component.id,
    component.slug,
    component.routeSlug,
    component.title,
    component.type,
    component.componentType,
  ].map(normalizeMatchKey).filter(Boolean);
}

function findMatchingDemoComponent(demoPackage, replacementComponent) {
  const replacementKeys = new Set(componentMatchKeys(replacementComponent));
  return (demoPackage?.components || []).find((demoComponent) => (
    componentMatchKeys(demoComponent).some((key) => replacementKeys.has(key))
  ));
}

function mergeComponentWithDemoFallback(replacementComponent, demoComponent) {
  if (!demoComponent) return replacementComponent;
  return {
    ...demoComponent,
    ...replacementComponent,
    pageUnits: replacementComponent.pageUnits?.length ? replacementComponent.pageUnits : demoComponent.pageUnits,
  };
}

export function mergeBookPackageWithDemoFallback(replacement) {
  const demoPackage = getDemoBookPackage(replacement.slug || replacement.id || replacement.packageTitle);
  const replacementComponents = replacement.components?.length ? replacement.components : demoPackage.components;
  return {
    ...demoPackage,
    ...replacement,
    components: replacementComponents.map((component) => (
      mergeComponentWithDemoFallback(component, findMatchingDemoComponent(demoPackage, component))
    )),
  };
}

export function replaceDemoBookPackage(bookPackages, replacement) {
  if (!replacement?.slug && !replacement?.id) return bookPackages;
  const mergedReplacement = mergeBookPackageWithDemoFallback(replacement);
  const replacementKey = mergedReplacement.slug || mergedReplacement.id;
  const nextPackages = bookPackages.map((bookPackage) => {
    const packageKey = bookPackage.slug || bookPackage.id;
    return packageKey === replacementKey ? mergedReplacement : bookPackage;
  });
  return nextPackages.some((bookPackage) => (bookPackage.slug || bookPackage.id) === replacementKey)
    ? nextPackages
    : [...nextPackages, mergedReplacement];
}

export function inferPackageSlugFromBookId(bookId = "") {
  const normalized = String(bookId || "").toLowerCase();
  if (normalized.startsWith("english-journey-6") || normalized.startsWith("ej6-")) return "english-journey-6";
  return "ultimate-b2";
}

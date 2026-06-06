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

export function replaceDemoBookPackage(bookPackages, replacement) {
  if (!replacement?.slug && !replacement?.id) return bookPackages;
  const replacementKey = replacement.slug || replacement.id;
  const nextPackages = bookPackages.map((bookPackage) => {
    const packageKey = bookPackage.slug || bookPackage.id;
    return packageKey === replacementKey ? replacement : bookPackage;
  });
  return nextPackages.some((bookPackage) => (bookPackage.slug || bookPackage.id) === replacementKey)
    ? nextPackages
    : [...nextPackages, replacement];
}

export function inferPackageSlugFromBookId(bookId = "") {
  const normalized = String(bookId || "").toLowerCase();
  if (normalized.startsWith("english-journey-6") || normalized.startsWith("ej6-")) return "english-journey-6";
  return "ultimate-b2";
}

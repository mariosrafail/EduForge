import { englishJourney6Package } from "../../data/englishJourney6DemoData.js";
import { ultimateB2Package } from "../../data/ultimateB2DemoData.js";
import { applyUltimateB2Unit2StudentsBookAndroidOverlay } from "./data/ultimateB2Unit2StudentsBook.js";

const englishJourneyPageAssets = import.meta.glob("../../assets/books/english-journey-6/pages/**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

const englishJourneyCoverAssets = import.meta.glob("../../assets/books/english-journey-6/covers/**/*.{png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});

function normalizeAssetKey(path = "") {
  return String(path)
    .replace(/^\/src\/assets\//, "../../assets/")
    .replace(/^src\/assets\//, "../../assets/");
}

export function resolveAndroidOfflineAsset(path) {
  if (!path) return null;
  if (/^(https?:)?\/\//i.test(path)) return null;

  const normalizedPath = normalizeAssetKey(path);
  return englishJourneyPageAssets[normalizedPath] || englishJourneyCoverAssets[normalizedPath] || path;
}

function resolvePage(page) {
  const pageSources = page.images?.length ? page.images : [page.imageSrc || page.imagePath || page.image].filter(Boolean);
  return {
    ...page,
    images: pageSources.map((source) => resolveAndroidOfflineAsset(source)).filter(Boolean),
  };
}

function resolveBookPackage(bookPackage) {
  const slug = bookPackage.slug || bookPackage.id || String(bookPackage.packageTitle || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return {
    ...bookPackage,
    id: bookPackage.id || slug,
    slug,
    shortDescription: bookPackage.description || "Offline interactive book package.",
    components: (bookPackage.components || []).map((component) => ({
      ...component,
      coverAsset: resolveAndroidOfflineAsset(component.coverAssetPath),
      pageUnits: (component.pageUnits || []).map((unit) => ({
        ...unit,
        pages: (unit.pages || []).map(resolvePage),
      })),
    })),
  };
}

const configuredSlug = import.meta.env.VITE_OFFLINE_BOOK_SLUG || "";

export const androidBooks = [
  resolveBookPackage(englishJourney6Package),
  resolveBookPackage({
    ...applyUltimateB2Unit2StudentsBookAndroidOverlay(ultimateB2Package),
    description: "Ultimate B2 interactive demo package with local pages, media, and activities where available.",
  }),
].filter((book) => (
  !configuredSlug || book.slug === configuredSlug || book.id === configuredSlug
));

export function getAndroidBook(slug) {
  return androidBooks.find((book) => book.slug === slug || book.id === slug) || null;
}

export function getDefaultAndroidBook() {
  return androidBooks[0] || null;
}

export function buildAndroidPageKey({ bookSlug, componentId, unitId, pageId }) {
  return [bookSlug, componentId, unitId, pageId].filter(Boolean).join(":");
}

export function flattenComponentPages(component) {
  return (component?.pageUnits || []).flatMap((unit) => (
    (unit.pages || []).map((page) => ({ unit, page }))
  ));
}

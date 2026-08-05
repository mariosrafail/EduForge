import { elementsNamed } from "./iwb-codec.js";
import { pngDimensions, resolveSourceFile, sha256File } from "./source-files.js";
import { createReviewItem } from "./ultimate-review.js";
import { componentHierarchyKey, pageHierarchyKey, unitGroupHierarchyKey } from "../../book-hierarchy.js";

const PAGE_PATTERN = /^Contents\/Resources\/assets\/books\/(book\d+)\/([^/]+)\/(\d+)\/parts\/(?:(HD|SD)\/)?parts_part_?(\d+)\.png$/i;

function printedPageEvidence(xml, part) {
  if (!xml) return { rawLabels: [], numericCandidate: null, confidence: 0, direct: false };
  const elements = [...elementsNamed(xml, "menuButton"), ...elementsNamed(xml, "button")];
  const matching = elements.filter((item) => [item.attributes.url, item.attributes.name].some((value) => value && new RegExp(`(?:part[_-]?)?${part}(?:\\D|$)`, "i").test(value)));
  const rawLabels = [...new Set(matching.flatMap((item) => [item.attributes.label, item.attributes.text, item.attributes.name].filter(Boolean)))].sort();
  const numeric = rawLabels.map((value) => String(value).match(/^\s*(\d{1,4})\s*$/)?.[1]).find(Boolean);
  return { rawLabels, numericCandidate: numeric ? Number(numeric) : null, confidence: numeric ? 0.9 : matching.length ? 0.55 : 0.2, direct: Boolean(numeric) };
}

export async function buildPageCandidates({ sourceRoot, inventoryEntries, internalDocuments, concurrency = 8 }) {
  const pageEntries = inventoryEntries.map((entry) => ({ entry, match: entry.path.match(PAGE_PATTERN) })).filter((item) => item.match).sort((a, b) => a.entry.path.localeCompare(b.entry.path));
  const assets = new Array(pageEntries.length); let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= pageEntries.length) return;
      const { entry, match } = pageEntries[index]; const source = await resolveSourceFile(sourceRoot, entry.path); const dimensions = await pngDimensions(source.absolutePath);
      assets[index] = { sourceRelativePath: entry.path, sourceBookRoot: match[1], component: match[2], unit: Number(match[3]), part: Number(match[5]), quality: match[4]?.toUpperCase() || "SPECIAL", width: dimensions.width, height: dimensions.height, byteSize: source.stat.size, sha256: entry.sha256 || await sha256File(source.absolutePath) };
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, pageEntries.length)) }, () => worker()));
  const groups = new Map();
  for (const asset of assets) {
    const key = `${asset.sourceBookRoot}\0${asset.component}\0${asset.unit}\0${asset.part}`;
    if (!groups.has(key)) groups.set(key, {
      sourceBookRoot: asset.sourceBookRoot,
      component: asset.component,
      componentKey: componentHierarchyKey(asset.sourceBookRoot, asset.component),
      unit: asset.unit,
      unitKey: unitGroupHierarchyKey(asset.sourceBookRoot, asset.component, asset.unit),
      part: asset.part,
      pageKey: pageHierarchyKey(asset.sourceBookRoot, asset.component, asset.unit, asset.part),
      variants: [],
    });
    groups.get(key).variants.push(asset);
  }
  const reviewItems = [];
  const spreads = [...groups.values()].map((spread) => {
    spread.variants.sort((a, b) => a.quality.localeCompare(b.quality));
    const unitParamsPath = [...internalDocuments.keys()].find((sourcePath) => sourcePath.toLowerCase().endsWith(`/${spread.sourceBookRoot.toLowerCase()}/${spread.component.toLowerCase()}/${spread.unit}/unit_params.iwb`));
    const printedPageCandidate = printedPageEvidence(unitParamsPath ? internalDocuments.get(unitParamsPath) : null, spread.part);
    const locator = spread.variants.find((item) => item.quality === "HD")?.sourceRelativePath || spread.variants[0].sourceRelativePath;
    const qualities = new Set(spread.variants.map((item) => item.quality));
    if (qualities.has("SPECIAL")) reviewItems.push(createReviewItem({ category: "page", locator, reasonCode: "ambiguous_special_page", explanation: "A single-resolution special screen needs role confirmation.", suggestedDecisionKind: "page_variant_role", evidence: [{ qualities: [...qualities] }] }));
    else { if (!qualities.has("HD")) reviewItems.push(createReviewItem({ category: "page", locator, reasonCode: "missing_hd_variant", explanation: "No HD page variant was found.", suggestedDecisionKind: "page_variant_choice" })); if (!qualities.has("SD")) reviewItems.push(createReviewItem({ category: "page", locator, reasonCode: "missing_sd_variant", explanation: "No SD page variant was found.", suggestedDecisionKind: "page_variant_choice" })); }
    const aspectRatios = spread.variants.map((item) => item.width / item.height);
    if (aspectRatios.length > 1 && Math.max(...aspectRatios) - Math.min(...aspectRatios) > 0.005 && !qualities.has("SPECIAL")) reviewItems.push(createReviewItem({ category: "page", locator, reasonCode: "page_dimension_mismatch", explanation: "HD and SD page variants have inconsistent aspect ratios.", suggestedDecisionKind: "page_variant_choice" }));
    if (!printedPageCandidate.direct) reviewItems.push(createReviewItem({ category: "page_number", locator, reasonCode: "uncertain_printed_page_number", explanation: "Printed page number is not directly encoded and remains unapproved.", suggestedDecisionKind: "printed_page_number", evidence: [{ rawLabels: printedPageCandidate.rawLabels }] }));
    return { ...spread, canonicalQualityCandidate: qualities.has("HD") ? "HD" : "SPECIAL", printedPageCandidate };
  }).sort((a, b) => a.sourceBookRoot.localeCompare(b.sourceBookRoot) || a.component.localeCompare(b.component) || a.unit - b.unit || a.part - b.part);
  return { artifact: { schemaVersion: "1.0", parserId: "ultimate-air-v2-pages", parserVersion: "1.0", summary: { pageImageFileCount: assets.length, distinctSpreadCount: spreads.length, hdCount: assets.filter((item) => item.quality === "HD").length, sdCount: assets.filter((item) => item.quality === "SD").length, specialCount: assets.filter((item) => item.quality === "SPECIAL").length }, spreads }, reviewItems };
}

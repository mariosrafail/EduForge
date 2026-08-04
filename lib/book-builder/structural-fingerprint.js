import fs from "node:fs/promises";
import path from "node:path";
import { stableHash } from "./stable-json.js";

export function normalizeStructuralPath(sourcePath) {
  return String(sourcePath).replaceAll("\\", "/").toLowerCase()
    .replace(/\/(unit|work|grammar|test|practice|review|section|video)\/\d+(?=\/)/g, "/$1/{n}")
    .replace(/\/(?:part)[_-]?\d+(?=\/|\.)/g, "/part{part}")
    .replace(/\/(?:obj)[_-]?\d+(?=\/|\.)/g, "/obj{obj}")
    .replace(/(^|\/)book\d+(?=\/)/g, "$1book{n}")
    .replace(/([_-])\d+(?=\.[a-z0-9]+$)/g, "$1{n}");
}

async function readSwfHeader(mainSwfAbsolutePath) {
  if (!mainSwfAbsolutePath) return null;
  const handle = await fs.open(mainSwfAbsolutePath, "r");
  try {
    const buffer = Buffer.alloc(12);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead < 8) return { valid: false, reason: "short_header" };
    const signature = buffer.subarray(0, 3).toString("ascii");
    return {
      valid: new Set(["FWS", "CWS", "ZWS"]).has(signature),
      signature,
      version: buffer[3],
      declaredFileLength: buffer.readUInt32LE(4),
    };
  } finally { await handle.close(); }
}

export async function buildStructuralFingerprint({ inventory, descriptor, mainSwfAbsolutePath }) {
  const paths = inventory.entries.map((entry) => entry.path.toLowerCase());
  const pathSet = new Set(paths);
  const metadataFamilies = {};
  const normalizedPathCounts = {};
  for (const entry of inventory.entries) {
    const pattern = normalizeStructuralPath(entry.path);
    normalizedPathCounts[pattern] = (normalizedPathCounts[pattern] || 0) + 1;
    if (["iwb_metadata", "structured_metadata", "atlas_metadata"].includes(entry.category)) {
      const name = path.posix.basename(entry.path).toLowerCase();
      metadataFamilies[name] = (metadataFamilies[name] || 0) + 1;
    }
  }
  const has = (fragment) => paths.some((item) => item.includes(fragment));
  const iwbFamilies = Object.keys(metadataFamilies).filter((name) => name.endsWith(".iwb"));
  const features = {
    validAirDescriptor: Boolean(descriptor),
    calledutainmentApplicationId: Boolean(descriptor?.id?.startsWith("com.calledutainment.hamilton.")),
    hasBooksRoot: has("contents/resources/assets/books/"),
    iwbCount: inventory.summary.categoryCounts.iwb_metadata || 0,
    iwbFamilies,
    hasUltimateParameterFamilies: ["home_params.iwb", "book1_params.iwb", "unit_params.iwb", "part_params.iwb", "obj_params.iwb"].every((name) => iwbFamilies.includes(name)),
    hasHd: has("/hd/"),
    hasSd: has("/sd/"),
    hasHdSdLayout: has("/hd/") && has("/sd/"),
    hasBookMenuCommon: has("/book_menu/common/") || (has("/book_menu/") && has("book1_params.iwb")),
    hasHomeGafPackage: pathSet.has("contents/resources/assets/home/common/logo_1.zip") || inventory.entries.some((entry) => entry.category === "gaf_package" && entry.path.toLowerCase().includes("/home/")),
    hasJourneyExerciseTemplates: ["multiplechoice", "draganddrop", "matching", "showanswer"].filter((name) => has(`/assets/exercises/${name}/`)).length >= 3,
    hasSingleResolutionPartImages: paths.some((item) => /\/parts\/parts_part_?\d+\./.test(item)),
    hasFlatAtlasMetadata: inventory.entries.some((entry) => entry.category === "atlas_metadata" && !/\/(?:hd|sd)\//i.test(entry.path)),
    componentDirectoryCount: new Set(paths.map((item) => item.match(/assets\/books\/book\d+\/([^/]+)\/\d+\//)?.[1]).filter(Boolean)).size,
    unitDirectoryCount: new Set(paths.map((item) => item.match(/assets\/books\/book\d+\/[^/]+\/(\d+)\//)?.[0]).filter(Boolean)).size,
    partDirectoryCount: new Set(paths.map((item) => item.match(/assets\/books\/book\d+\/[^/]+\/\d+\/(part\d+)\//)?.[0]).filter(Boolean)).size,
    objectDirectoryCount: new Set(paths.map((item) => item.match(/assets\/books\/book\d+\/[^/]+\/\d+\/part\d+\/(obj\d+)\//)?.[0]).filter(Boolean)).size,
  };
  const swfHeader = await readSwfHeader(mainSwfAbsolutePath);
  const basis = {
    descriptor: descriptor ? { id: descriptor.id, airVersion: descriptor.airVersion, versionNumber: descriptor.versionNumber, mainSwfPath: descriptor.mainSwfPath, descriptorSha256: descriptor.descriptorSha256 } : null,
    swfHeader,
    inventoryStructuralDigest: inventory.structuralDigest,
    extensionCounts: inventory.summary.extensionCounts,
    metadataFamilies: Object.fromEntries(Object.entries(metadataFamilies).sort()),
    features,
  };
  return {
    schemaVersion: "1.0",
    fingerprintKind: "structural-partial",
    fingerprintSha256: stableHash(basis),
    ...basis,
    normalizedPathCounts: Object.fromEntries(Object.entries(normalizedPathCounts).sort()),
  };
}

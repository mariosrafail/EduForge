import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export const CLASSIFICATIONS = Object.freeze([
  "students-book-page",
  "students-book-exercise",
  "students-book-audio",
  "students-book-video",
  "students-book-image",
  "students-book-answer-data",
  "students-book-instructions",
  "students-book-hotspot",
  "students-book-navigation",
  "students-book-unknown",
  "other-book-component",
  "runtime-or-engine",
  "duplicate",
  "unused-or-unreferenced",
]);

export const RECOVERABILITY = Object.freeze([
  "fully-recoverable",
  "recoverable-with-manual-review",
  "question-text-only",
  "media-only",
  "interaction-known-answer-unknown",
  "answer-known-interaction-unknown",
  "encoded-unresolved",
  "not-an-exercise",
]);

const PACKAGE_RESOURCE_PREFIX = "Contents/Resources/";
const BOOK_PREFIX = `${PACKAGE_RESOURCE_PREFIX}assets/books/book1/`;
const STUDENTS_BOOK_PREFIX = `${BOOK_PREFIX}unit/`;
const STUDENTS_MEDIA_PREFIX = `${PACKAGE_RESOURCE_PREFIX}assets/videos/book1/unit/`;
const OTHER_COMPONENT_ROOTS = new Set([
  "companion", "grammar", "grammarVideo", "practice", "practiceWork", "progress",
  "progressWork", "reference", "review", "speakingbank", "tasks", "test", "video",
  "work", "worksheets", "writingbank",
]);
const MEDIA_EXTENSIONS = new Set([".mp3", ".mp4", ".flv", ".srt"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".bmp"]);
const XML_PARSER = new XMLParser({
  allowBooleanAttributes: false,
  ignoreAttributes: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
  trimValues: false,
});
const EXISTING_UNIT_2_ACTIVITY_OBJECTS = new Set([
  "ultimate-b2-sb-u2-p2-o3",
  "ultimate-b2-sb-u2-p2-o4",
]);
const EXISTING_UNIT_2_ACTIVITY_TYPES = new Map([
  ["ultimate-b2-sb-u2-p2-o3", "matching"],
  ["ultimate-b2-sb-u2-p2-o4", "multiple-choice"],
]);

function posix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

export function isPathWithinRoot(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function resolveSafeSourceRoot(sourceRoot) {
  const absolute = path.resolve(sourceRoot);
  const rootStats = await lstat(absolute);
  if (!rootStats.isDirectory()) throw new Error(`Source root is not a directory: ${absolute}`);
  const resolved = await realpath(absolute);
  return { absolute, resolved };
}

async function collectFiles(sourceRoot) {
  const { absolute, resolved } = await resolveSafeSourceRoot(sourceRoot);
  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await realpath(candidate);
        if (!isPathWithinRoot(resolved, target)) {
          throw new Error(`Symlink escapes source root: ${posix(path.relative(absolute, candidate))}`);
        }
        const targetStats = await stat(target);
        if (targetStats.isDirectory()) {
          throw new Error(`Directory symlinks are not traversed: ${posix(path.relative(absolute, candidate))}`);
        }
        files.push({ absolutePath: target, relativePath: posix(path.relative(absolute, candidate)), size: targetStats.size });
        continue;
      }
      if (entry.isDirectory()) {
        await visit(candidate);
      } else if (entry.isFile()) {
        const fileStats = await stat(candidate);
        files.push({ absolutePath: candidate, relativePath: posix(path.relative(absolute, candidate)), size: fileStats.size });
      }
    }
  }

  await visit(absolute);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));
  return { absolute, files };
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function mapConcurrent(values, concurrency, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

function mimeFromExtension(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  return ({
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".bmp": "image/bmp",
    ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".flv": "video/x-flv", ".srt": "application/x-subrip",
    ".xml": "application/xml", ".json": "application/json", ".txt": "text/plain", ".plist": "application/x-plist",
    ".zip": "application/zip", ".swf": "application/x-shockwave-flash", ".iwb": "application/octet-stream",
    ".exe": "application/vnd.microsoft.portable-executable", ".dll": "application/vnd.microsoft.portable-executable",
    ".dylib": "application/x-mach-binary", ".nib": "application/octet-stream", ".strings": "text/plain",
  })[extension] || "application/octet-stream";
}

function fileType(relativePath) {
  return path.posix.extname(relativePath).toLowerCase().replace(/^\./, "") || "none";
}

function unitPart(relativePath) {
  const match = relativePath.match(/\/unit\/(\d+)\/part(\d+)(?:\/|$)/i)
    || relativePath.match(/\/unit\/(\d+)\/parts\/(?:HD|SD)\/parts_part_(\d+)\.png$/i);
  return match ? { unitNumber: Number(match[1]), partNumber: Number(match[2]) } : {};
}

export function pagesForUnitPart(unitNumber, partNumber) {
  if (!Number.isInteger(unitNumber) || !Number.isInteger(partNumber)) return {};
  const unitStart = unitNumber === 1 ? 5 : 19 + ((unitNumber - 2) * 16);
  const pageWidths = unitNumber === 1
    ? [1, 2, 2, 2, 1, 1, 2, 1, 1, 1]
    : unitNumber % 2 === 0
      ? [1, 2, 2, 2, 1, 1, 2, 1, 1, 1, 1, 1]
      : [1, 2, 2, 2, 1, 1, 2, 1, 2, 2];
  if (partNumber < 1 || partNumber > pageWidths.length) return {};
  const start = unitStart + pageWidths.slice(0, partNumber - 1).reduce((sum, width) => sum + width, 0);
  const width = pageWidths[partNumber - 1];
  return {
    pageNumber: start,
    spreadNumber: width === 2 ? `${start}-${start + 1}` : String(start),
  };
}

export function validateHotspotCoordinates(hotspot) {
  const values = [hotspot?.left, hotspot?.top, hotspot?.width, hotspot?.height];
  if (!values.every((value) => Number.isFinite(value))) return false;
  const [left, top, width, height] = values;
  return left >= 0 && top >= 0 && width > 0 && height > 0 && left + width <= 100 && top + height <= 100;
}

export function validateExtractedActivity(activity) {
  const errors = [];
  if (!activity?.id) errors.push("activity id is required");
  if (!Array.isArray(activity?.questions) || activity.questions.length === 0) errors.push("at least one question is required");
  for (const question of activity?.questions || []) {
    if (!question.id) errors.push("question id is required");
    if (!Array.isArray(question.options) || question.options.length === 0) errors.push(`options are required for ${question.id || "question"}`);
    const optionIds = new Set((question.options || []).map((option) => option.id));
    const answers = Array.isArray(question.correctAnswers) ? question.correctAnswers : [question.correctAnswer].filter(Boolean);
    if (answers.length === 0) errors.push(`answer key is required for ${question.id || "question"}`);
    for (const answer of answers) if (!optionIds.has(answer)) errors.push(`answer ${answer} is not an option for ${question.id || "question"}`);
  }
  return { valid: errors.length === 0, errors };
}

function activityIdentity(relativePath) {
  const match = relativePath.match(/\/unit\/(\d+)\/part(\d+)\/obj(\d+)(?:\/|$)/i);
  if (!match) return {};
  return {
    suspectedActivityId: `ultimate-b2-sb-u${Number(match[1])}-p${Number(match[2])}-o${Number(match[3])}`,
    objectNumber: Number(match[3]),
  };
}

function sourceRole(relativePath, referencedPaths) {
  if (relativePath.startsWith(STUDENTS_MEDIA_PREFIX) || referencedPaths.has(relativePath)) {
    const extension = path.posix.extname(relativePath).toLowerCase();
    return extension === ".srt" ? "students-book-instructions" : "students-book-video";
  }
  if (!relativePath.startsWith(STUDENTS_BOOK_PREFIX)) {
    if (relativePath.startsWith(BOOK_PREFIX)) {
      const componentRoot = relativePath.slice(BOOK_PREFIX.length).split("/")[0];
      return OTHER_COMPONENT_ROOTS.has(componentRoot) ? "other-book-component" : "runtime-or-engine";
    }
    return "runtime-or-engine";
  }
  const extension = path.posix.extname(relativePath).toLowerCase();
  const name = path.posix.basename(relativePath).toLowerCase();
  if (/\/parts\/HD\/parts_part_\d+\.png$/i.test(relativePath)) return "students-book-page";
  if (/\/parts\/SD\/parts_part_\d+\.png$/i.test(relativePath) || /\/parts\/(?:HD|SD)\/parts_BG/i.test(relativePath)) return "students-book-image";
  if (extension === ".mp3") return "students-book-audio";
  if ([".mp4", ".flv", ".srt"].includes(extension) || name === "video.xml") return "students-book-video";
  if (name === "questions_params.iwb") return "students-book-answer-data";
  if (["unit_params.iwb", "part_params.iwb"].includes(name)) return "students-book-navigation";
  if (name.includes("highlight_params")) return "students-book-hotspot";
  if (extension === ".iwb") return "students-book-exercise";
  if (extension === ".xml" && name.includes("obj_params")) return "students-book-instructions";
  if (extension === ".xml" && name.includes("atlas")) return "students-book-image";
  if (IMAGE_EXTENSIONS.has(extension)) return "students-book-image";
  return "students-book-unknown";
}

function getScalarStrings(value, strings = []) {
  if (typeof value === "string") strings.push(value);
  else if (Array.isArray(value)) value.forEach((item) => getScalarStrings(item, strings));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => getScalarStrings(item, strings));
  return strings;
}

function normalizePublisherReference(reference) {
  const normalized = reference.trim().replaceAll("\\", "/");
  const assetsIndex = normalized.indexOf("assets/");
  if (assetsIndex === -1) return null;
  return `${PACKAGE_RESOURCE_PREFIX}${normalized.slice(assetsIndex)}`.replaceAll(/\/+/g, "/");
}

async function inspectStructuredFiles(files) {
  const results = new Map();
  const referencedPaths = new Set();
  const referenceContexts = new Map();
  for (const file of files) {
    if (!file.relativePath.startsWith(STUDENTS_BOOK_PREFIX)) continue;
    const extension = path.posix.extname(file.relativePath).toLowerCase();
    if (extension !== ".xml" && extension !== ".json") continue;
    try {
      const raw = await readFile(file.absolutePath, "utf8");
      let parsed;
      if (extension === ".json") parsed = JSON.parse(raw);
      else {
        const validation = XMLValidator.validate(raw, { allowBooleanAttributes: false });
        if (validation !== true) throw new Error(validation.err?.msg || "Invalid XML");
        parsed = XML_PARSER.parse(raw);
      }
      const references = getScalarStrings(parsed)
        .filter((value) => /\.(?:mp3|mp4|flv|srt|png|jpe?g)(?:$|[?#])/i.test(value.trim()))
        .map(normalizePublisherReference)
        .filter(Boolean);
      const partContext = unitPart(file.relativePath);
      const activityContext = activityIdentity(file.relativePath);
      const pageContext = pagesForUnitPart(partContext.unitNumber, partContext.partNumber);
      references.forEach((reference) => {
        referencedPaths.add(reference);
        if (!referenceContexts.has(reference)) referenceContexts.set(reference, { ...partContext, ...pageContext, ...activityContext });
      });
      const strings = getScalarStrings(parsed);
      const activityHint = strings.find((value) => /sentence completion|multiple choice|matching|gap fill|true\s*\/\s*false|ordering/i.test(value)) || null;
      results.set(file.relativePath, { status: "parsed", references: [...new Set(references)].sort(), activityHint });
    } catch (error) {
      results.set(file.relativePath, { status: "parse-failed", references: [], error: error.message });
    }
  }
  return { results, referencedPaths, referenceContexts };
}

async function inspectIwb(file) {
  const raw = (await readFile(file.absolutePath, "utf8")).trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return { binaryStatus: "unresolved", signature: "not-base64" };
  try {
    const decoded = Buffer.from(raw, "base64");
    const signature = decoded.subarray(0, 16).toString("hex");
    const archive = decoded.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    return {
      binaryStatus: archive ? "extractable" : "encoded-or-proprietary",
      encoding: "base64-wrapper",
      decodedBytes: decoded.length,
      signature,
    };
  } catch {
    return { binaryStatus: "unresolved", signature: "invalid-base64" };
  }
}

function suspectedActivityType(structuredResult, relativePath) {
  const hint = structuredResult?.activityHint?.toLowerCase() || "";
  if (hint.includes("sentence completion")) return "listening-gap-fill";
  if (hint.includes("multiple choice")) return "multiple-choice";
  if (hint.includes("matching")) return "matching";
  if (hint.includes("true")) return "true-false";
  if (hint.includes("ordering")) return "ordering";
  if (relativePath.endsWith("questions_params.iwb")) return "timed-quiz-unknown";
  return "unknown";
}

function recoverabilityForActivity(id, files, structuredResults) {
  const names = new Set(files.map((file) => path.posix.basename(file.sourceRelativePath).toLowerCase()));
  const xml = files.map((file) => structuredResults.get(file.sourceRelativePath)).filter(Boolean);
  const hint = xml.find((item) => item.activityHint)?.activityHint;
  const hasEncodedQuestionData = names.has("questions_params.iwb") || names.has("obj_params.iwb");
  const hasVideo = files.some((file) => (file.originalClassification || file.classification) === "students-book-video");
  const hasAudio = files.some((file) => (file.originalClassification || file.classification) === "students-book-audio");
  if (EXISTING_UNIT_2_ACTIVITY_OBJECTS.has(id)) return "recoverable-with-manual-review";
  if (hint && hasEncodedQuestionData) return "interaction-known-answer-unknown";
  if (names.has("questions_params.iwb")) return "encoded-unresolved";
  if (hasVideo || hasAudio) return "media-only";
  if (hasEncodedQuestionData) return "encoded-unresolved";
  return "not-an-exercise";
}

function buildStructure(inventory, structuredResults) {
  const units = [];
  for (let unitNumber = 1; unitNumber <= 10; unitNumber += 1) {
    const unitFiles = inventory.filter((item) => item.unitNumber === unitNumber);
    const pageFiles = unitFiles.filter((item) => item.originalClassification === "students-book-page" || item.classification === "students-book-page");
    const pageByPart = new Map();
    for (const file of pageFiles) {
      if (!pageByPart.has(file.partNumber) || file.sourceRelativePath.includes("/HD/")) pageByPart.set(file.partNumber, file);
    }
    const activityGroups = new Map();
    for (const file of unitFiles.filter((item) => item.suspectedActivityId)) {
      if (!activityGroups.has(file.suspectedActivityId)) activityGroups.set(file.suspectedActivityId, []);
      activityGroups.get(file.suspectedActivityId).push(file);
    }
    const activities = [...activityGroups.entries()].map(([id, files]) => {
      const metadata = files.map((file) => structuredResults.get(file.sourceRelativePath)).find((result) => result?.activityHint);
      const hasQuestionParams = files.some((file) => file.sourceRelativePath.endsWith("questions_params.iwb"));
      const detectedExercise = hasQuestionParams || Boolean(metadata?.activityHint) || EXISTING_UNIT_2_ACTIVITY_OBJECTS.has(id);
      return {
        id,
        partNumber: files[0].partNumber,
        pageNumber: files[0].pageNumber,
        spreadNumber: files[0].spreadNumber,
        order: files[0].objectNumber,
        suspectedType: EXISTING_UNIT_2_ACTIVITY_TYPES.get(id) || suspectedActivityType(metadata, files.find((file) => file.sourceRelativePath.endsWith("questions_params.iwb"))?.sourceRelativePath || ""),
        recoverability: recoverabilityForActivity(id, files, structuredResults),
        detectedExercise,
        detectionBasis: hasQuestionParams ? "encoded-question-metadata" : metadata?.activityHint ? "readable-activity-metadata" : EXISTING_UNIT_2_ACTIVITY_OBJECTS.has(id) ? "existing-controlled-implementation-and-page-audit" : "unresolved-object-metadata",
        sourceMetadataFiles: files.filter((file) => /(?:params\.iwb|\.xml)$/i.test(file.sourceRelativePath)).map((file) => file.sourceRelativePath).sort(),
        media: files.filter((file) => ["students-book-audio", "students-book-video"].includes(file.originalClassification || file.classification)).map((file) => file.sourceRelativePath).sort(),
        automaticPublication: false,
      };
    }).sort((left, right) => left.partNumber - right.partNumber || left.order - right.order || left.id.localeCompare(right.id));
    units.push({
      number: unitNumber,
      pageRange: pageFiles.length ? `${Math.min(...pageFiles.map((file) => file.pageNumber))}-${Math.max(...pageFiles.map((file) => Number(file.spreadNumber.split("-").at(-1))))}` : null,
      pages: [...pageByPart.values()].sort((left, right) => left.partNumber - right.partNumber).map((file, index) => ({
        id: `ultimate-b2-sb-u${unitNumber}-part-${file.partNumber}`,
        partNumber: file.partNumber,
        pageNumber: file.pageNumber,
        spreadNumber: file.spreadNumber,
        navigationOrder: index + 1,
        pageImage: file.sourceRelativePath,
        hotspots: [],
        activities: activities.filter((activity) => activity.partNumber === file.partNumber).map((activity) => activity.id),
      })),
      activities,
      media: unitFiles.filter((file) => ["students-book-audio", "students-book-video"].includes(file.originalClassification || file.classification)).map((file) => file.sourceRelativePath).sort(),
    });
  }
  return { book: "ultimate-b2", edition: "publisher-air-package", component: "students-book", units };
}

function buildReview(structure, inventory, packageSummary) {
  const activities = structure.units.flatMap((unit) => unit.activities);
  const exercises = activities.filter((activity) => activity.detectedExercise);
  const count = (status) => exercises.filter((activity) => activity.recoverability === status).length;
  const detectedTypes = [...new Set(exercises.map((activity) => activity.suspectedType).filter((type) => type !== "unknown"))].sort();
  const supportedTypes = new Set(["multiple-choice", "multiple-select", "true-false", "matching", "ordering", "gap-fill", "typed-short-answer", "sentence-transformation", "listening-gap-fill", "reading-comprehension", "timed-quiz"]);
  return {
    book: "ultimate-b2",
    component: "students-book",
    sourceBoundary: ["Contents/Resources/assets/books/book1/unit", "Contents/Resources/assets/videos/book1/unit", "media paths referenced by Students Book XML"],
    excludedComponents: [...OTHER_COMPONENT_ROOTS].sort(),
    unitCount: structure.units.length,
    pageImageCount: structure.units.reduce((sum, unit) => sum + unit.pages.length, 0),
    physicalPageCount: 158,
    physicalPageRange: "5-162",
    activityObjectCount: activities.length,
    exerciseDetectedCount: exercises.length,
    recoverability: Object.fromEntries(RECOVERABILITY.map((status) => [status, count(status)])),
    fullyRecoverableCount: count("fully-recoverable"),
    manualReviewCount: count("recoverable-with-manual-review") + count("interaction-known-answer-unknown"),
    unresolvedCount: count("encoded-unresolved"),
    activityTypesDetected: detectedTypes,
    supportedActivityTypesDetected: detectedTypes.filter((type) => supportedTypes.has(type)),
    unsupportedActivityTypes: [...detectedTypes.filter((type) => !supportedTypes.has(type)), "encoded proprietary IWB interaction"],
    missingAnswerKeys: exercises.filter((activity) => ["encoded-unresolved", "interaction-known-answer-unknown", "recoverable-with-manual-review"].includes(activity.recoverability)).map((activity) => activity.id),
    units: structure.units.map((unit) => {
      const unitExercises = unit.activities.filter((activity) => activity.detectedExercise);
      return {
        number: unit.number,
        pageRange: unit.pageRange,
        pageImageCount: unit.pages.length,
        exerciseDetectedCount: unitExercises.length,
        fullyRecoverableCount: unitExercises.filter((activity) => activity.recoverability === "fully-recoverable").length,
        manualReviewCount: unitExercises.filter((activity) => ["recoverable-with-manual-review", "interaction-known-answer-unknown"].includes(activity.recoverability)).length,
        unresolvedCount: unitExercises.filter((activity) => activity.recoverability === "encoded-unresolved").length,
        manualReviewSources: unitExercises.filter((activity) => activity.recoverability !== "fully-recoverable").map((activity) => ({ id: activity.id, recoverability: activity.recoverability, sourceMetadataFiles: activity.sourceMetadataFiles })),
      };
    }),
    mediaCounts: {
      audio: inventory.filter((item) => (item.originalClassification || item.classification) === "students-book-audio").length,
      videoAndCaption: inventory.filter((item) => (item.originalClassification || item.classification) === "students-book-video").length,
      image: inventory.filter((item) => (item.originalClassification || item.classification) === "students-book-image").length,
    },
    duplicateGroupCount: packageSummary.duplicateGroupCount,
    parseFailureCount: packageSummary.parseFailureCount,
    selectedFirstUnit: 2,
    selectionReason: "Unit 2 has confirmed page numbering, existing page images and hotspots, readable media metadata, and two existing interactions that can be audited without automatically publishing unresolved IWB activities.",
    automaticPublicationBlockedReason: "No publisher answer key is readable outside encoded IWB payloads; existing answer data cannot be promoted as publisher-verified.",
  };
}

export async function scanUltimateB2StudentsBook({ sourceRoot, hashConcurrency = 6 } = {}) {
  if (!sourceRoot) throw new Error("A source root is required");
  const before = await stat(sourceRoot);
  const { files } = await collectFiles(sourceRoot);
  const { results: structuredResults, referencedPaths, referenceContexts } = await inspectStructuredFiles(files);
  const referencedWithSidecars = new Set(referencedPaths);
  for (const reference of referencedPaths) {
    if (reference.endsWith(".mp4")) {
      const sidecar = reference.replace(/\.mp4$/i, ".srt");
      referencedWithSidecars.add(sidecar);
      if (referenceContexts.has(reference)) referenceContexts.set(sidecar, referenceContexts.get(reference));
    }
  }
  const hashed = await mapConcurrent(files, hashConcurrency, async (file) => ({ ...file, sha256: await sha256(file.absolutePath) }));
  const groups = new Map();
  for (const file of hashed) {
    if (!groups.has(file.sha256)) groups.set(file.sha256, []);
    groups.get(file.sha256).push(file.relativePath);
  }
  for (const paths of groups.values()) paths.sort((left, right) => left.localeCompare(right, "en"));

  const relevant = hashed.filter((file) => file.relativePath.startsWith(STUDENTS_BOOK_PREFIX)
    || file.relativePath.startsWith(STUDENTS_MEDIA_PREFIX)
    || referencedWithSidecars.has(file.relativePath));
  const iwbs = new Map();
  for (const file of relevant.filter((item) => item.relativePath.endsWith(".iwb"))) iwbs.set(file.relativePath, await inspectIwb(file));

  const inventory = relevant.map((file) => {
    const directUnitInfo = unitPart(file.relativePath);
    const referenceContext = referenceContexts.get(file.relativePath) || {};
    const unitInfo = directUnitInfo.unitNumber ? directUnitInfo : referenceContext;
    const pages = directUnitInfo.unitNumber ? pagesForUnitPart(unitInfo.unitNumber, unitInfo.partNumber) : referenceContext;
    const directActivity = activityIdentity(file.relativePath);
    const activity = directActivity.suspectedActivityId ? directActivity : referenceContext;
    const originalClassification = sourceRole(file.relativePath, referencedWithSidecars);
    const duplicatePaths = groups.get(file.sha256);
    const duplicateOf = duplicatePaths.length > 1 ? duplicatePaths[0] : null;
    const isDuplicate = duplicateOf && duplicateOf !== file.relativePath;
    const structured = structuredResults.get(file.relativePath);
    const iwb = iwbs.get(file.relativePath);
    const objectPrefix = activity.suspectedActivityId ? file.relativePath.replace(/\/[^/]+$/, "") : null;
    const objectFiles = objectPrefix ? relevant.filter((candidate) => candidate.relativePath.startsWith(`${objectPrefix}/`)) : [];
    const refs = objectFiles.flatMap((candidate) => structuredResults.get(candidate.relativePath)?.references || []);
    return {
      sourceRelativePath: file.relativePath,
      fileType: fileType(file.relativePath),
      byteSize: file.size,
      sha256: file.sha256,
      detectedMimeType: mimeFromExtension(file.relativePath),
      classification: isDuplicate ? "duplicate" : originalClassification,
      originalClassification,
      duplicateOf: isDuplicate ? duplicateOf : null,
      unitNumber: unitInfo.unitNumber || null,
      partNumber: unitInfo.partNumber || null,
      pageNumber: pages.pageNumber || null,
      spreadNumber: pages.spreadNumber || null,
      suspectedActivityId: activity.suspectedActivityId || null,
      objectNumber: activity.objectNumber || null,
      suspectedActivityType: suspectedActivityType(structured, file.relativePath),
      referencedAudioFiles: [...new Set(refs.filter((value) => value.endsWith(".mp3")))].sort(),
      referencedVideoFiles: [...new Set(refs.filter((value) => /\.(?:mp4|flv|srt)$/i.test(value)))].sort(),
      referencedImageFiles: [...new Set(refs.filter((value) => /\.(?:png|jpe?g)$/i.test(value)))].sort(),
      sourceMetadataFile: /(?:params\.iwb|\.xml|\.json)$/i.test(file.relativePath) ? file.relativePath : null,
      confidence: file.relativePath.startsWith(STUDENTS_BOOK_PREFIX) ? "confirmed" : "high",
      extractionStatus: iwb?.binaryStatus || structured?.status || (MEDIA_EXTENSIONS.has(path.posix.extname(file.relativePath).toLowerCase()) || IMAGE_EXTENSIONS.has(path.posix.extname(file.relativePath).toLowerCase()) ? "media-only" : "inventoried"),
      binaryInspection: iwb || null,
      notes: structured?.error || (iwb ? "Base64 wrapper decoded for signature analysis only; payload was not executed." : null),
    };
  }).sort((left, right) => left.sourceRelativePath.localeCompare(right.sourceRelativePath, "en"));

  const extensionGroups = new Map();
  const topLevelGroups = new Map();
  let totalBytes = 0;
  for (const file of hashed) {
    totalBytes += file.size;
    const extension = path.posix.extname(file.relativePath).toLowerCase() || "[none]";
    const top = file.relativePath.split("/")[0];
    extensionGroups.set(extension, (extensionGroups.get(extension) || 0) + 1);
    topLevelGroups.set(top, (topLevelGroups.get(top) || 0) + 1);
  }
  const packageSummary = {
    sourceDescription: "local ignored Ultimate English B2.app package",
    totalFileCount: hashed.length,
    totalByteSize: totalBytes,
    topLevelDirectories: [...topLevelGroups.entries()].map(([name, fileCount]) => ({ name, fileCount })).sort((a, b) => a.name.localeCompare(b.name)),
    fileTypes: [...extensionGroups.entries()].map(([extension, count]) => ({ extension, count })).sort((a, b) => b.count - a.count || a.extension.localeCompare(b.extension)),
    duplicateGroupCount: [...groups.values()].filter((paths) => paths.length > 1).length,
    duplicateFileCount: [...groups.values()].filter((paths) => paths.length > 1).reduce((sum, paths) => sum + paths.length, 0),
    studentsBookInventoryCount: inventory.length,
    parseFailureCount: [...structuredResults.values()].filter((result) => result.status === "parse-failed").length,
    structuredFileCount: structuredResults.size,
    iwbFileCount: iwbs.size,
    iwbStatuses: Object.fromEntries([...new Set([...iwbs.values()].map((item) => item.binaryStatus))].sort().map((status) => [status, [...iwbs.values()].filter((item) => item.binaryStatus === status).length])),
  };
  const structure = buildStructure(inventory, structuredResults);
  const review = buildReview(structure, inventory, packageSummary);
  const after = await stat(sourceRoot);
  if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) throw new Error("Source root changed during scan");
  return { schemaVersion: "1.0", packageSummary, inventory, structure, review };
}

export async function writeDeterministicJson(filePath, value, { pretty = true } = {}) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, "utf8");
}

import { realpath } from "node:fs/promises";
import path from "node:path";
import { ultimateB2TeacherAppAuthoring } from "../../src/data/ultimate-b2/teacherAppAuthoring.js";

const sourceAssets = new Map([
  ["ultimate-b2.students-book.cover", { type: "image/jpeg", role: "cover", path: "src/assets/books/ultimate-b2/covers/ultimate_b2_students_book.jpg" }],
  ["ultimate-b2.workbook.cover", { type: "image/jpeg", role: "cover", path: "src/assets/books/ultimate-b2/covers/ultimate_b2_workbook.jpg" }],
  ["ultimate-b2.grammar-book.cover", { type: "image/jpeg", role: "cover", path: "src/assets/books/ultimate-b2/covers/ultimate_b2_grammar_book.jpg" }],
  ["ultimate-b2.test-book.cover", { type: "image/jpeg", role: "cover", path: "src/assets/books/ultimate-b2/covers/ultimate_b2_test_book.jpg" }],
  ["ultimate-b2.students-book.unit-2.reading.text-image", { type: "image/jpeg", role: "illustration", path: "src/assets/books/ultimate-b2/student-text.jpg" }],
  ...[1, 2, 3].map((number) => [
    `ultimate-b2.legacy-pilot.unit-1.part-2.obj2.highlight-${number}`,
    {
      type: "audio/mpeg",
      role: "audio_segment",
      path: `src/assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj2/audio/highlight_${number}.mp3`,
    },
  ]),
  ...[1, 2, 3, 4, 5, 6].map((number) => [
    `ultimate-b2.legacy-pilot.unit-1.part-2.obj3.highlight-${number}`,
    {
      type: "audio/mpeg",
      role: "audio_segment",
      path: `src/assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj3/audio/highlight_${number}.mp3`,
    },
  ]),
]);

const mediaAssets = new Map([
  ["ultimate-b2.students-book.unit-1.reading.video-intro", { type: "video/mp4", role: "video", path: "Contents/Resources/assets/videos/book1/unit/1/part2/obj1.mp4" }],
  ["ultimate-b2.students-book.unit-1.reading.text-audio", { type: "audio/mpeg", role: "audio", path: "Contents/Resources/assets/books/book1/unit/1/part2/obj2/audio.mp3" }],
  ["ultimate-b2.students-book.unit-1.reading.extra-video-1", { type: "video/mp4", role: "video", path: "Contents/Resources/assets/videos/book1/extra/1/U1V1.mp4" }],
  ["ultimate-b2.students-book.unit-1.reading.extra-video-2", { type: "video/mp4", role: "video", path: "Contents/Resources/assets/videos/book1/extra/1/U1V2.mp4" }],
  ["ultimate-b2.students-book.unit-1.reading.extra-video-3", { type: "video/mp4", role: "video", path: "Contents/Resources/assets/videos/book1/extra/1/U1V3.mp4" }],
  ["ultimate-b2.students-book.unit-1.grammar.video-intro", { type: "video/mp4", role: "video", path: "Contents/Resources/assets/videos/book1/unit/1/part4/obj1.mp4" }],
  ["ultimate-b2.students-book.unit-1.listening.television-dialogue", { type: "audio/mpeg", role: "audio", path: "Contents/Resources/assets/books/book1/unit/1/part5/obj3/audio.mp3" }],
  ["ultimate-b2.students-book.unit-1.listening.six-situations", { type: "audio/mpeg", role: "audio", path: "Contents/Resources/assets/books/book1/unit/1/part5/obj4/audio.mp3" }],
  ["ultimate-b2.students-book.unit-1.listening.discussion-review", { type: "audio/mpeg", role: "audio", path: "Contents/Resources/assets/books/book1/unit/1/part5/obj5/audio.mp3" }],
  ["ultimate-b2.students-book.unit-1.speaking.student-comparison", { type: "audio/mpeg", role: "audio", path: "Contents/Resources/assets/books/book1/unit/1/part6/obj2/audio.mp3" }],
  ["ultimate-b2.students-book.unit-1.practice.eight-situations", { type: "audio/mpeg", role: "audio", path: "Contents/Resources/assets/books/book1/unit/1/part10/obj1/audio.mp3" }],
  ["ultimate-b2.students-book.unit-2.reading.video-intro", { type: "video/mp4", role: "video", path: "Contents/Resources/assets/videos/book1/unit/2/part2/obj1.mp4" }],
  ["ultimate-b2.students-book.unit-2.reading.text-audio", { type: "audio/mpeg", role: "audio", path: "Contents/Resources/assets/books/book1/unit/2/part2/obj2/audio.mp3" }],
  ["ultimate-b2.students-book.unit-2.grammar.video-intro", { type: "video/mp4", role: "video", path: "Contents/Resources/assets/videos/book1/unit/2/part4/obj1.mp4" }],
  ["ultimate-b2.students-book.unit-2.listening.fjords", { type: "audio/mpeg", role: "audio", path: "Contents/Resources/assets/books/book1/unit/2/part5/obj3/audio.mp3" }],
  ["ultimate-b2.students-book.unit-2.listening.iceland-trip", { type: "audio/mpeg", role: "audio", path: "Contents/Resources/assets/books/book1/unit/2/part5/obj4/audio.mp3" }],
  ["ultimate-b2.students-book.unit-2.speaking.photo-comparison", { type: "audio/mpeg", role: "audio", path: "Contents/Resources/assets/books/book1/unit/2/part6/obj2/audio.mp3" }],
  ["ultimate-b2.students-book.unit-2.practice.tristan-da-cunha", { type: "audio/mpeg", role: "audio", path: "Contents/Resources/assets/books/book1/unit/2/part10/obj3/audio.mp3" }],
]);

const authoredPagesByLogicalKey = new Map(ultimateB2TeacherAppAuthoring.pages.map((page) => [page.logicalAssetIdentity, page]));

export function getUltimateB2LocalAsset(logicalKey) {
  const key = String(logicalKey || "");
  if (sourceAssets.has(key)) return { ...sourceAssets.get(key), logicalKey: key, endpoint: "source" };
  if (mediaAssets.has(key)) return { ...mediaAssets.get(key), logicalKey: key, endpoint: "media" };

  const page = authoredPagesByLogicalKey.get(key);
  if (page) {
    return {
      logicalKey: key,
      type: page.image.mediaType,
      role: "page_image",
      path: page.image.repositoryPath,
      endpoint: "source",
    };
  }
  return null;
}

export function localUltimateB2AssetUrl(asset) {
  const endpoint = asset?.endpoint === "media" ? "ultimate-b2-media" : "ultimate-b2-source-asset";
  return `/.netlify/functions/${endpoint}?logicalKey=${encodeURIComponent(asset.logicalKey)}`;
}

export async function resolveAllowlistedUltimateB2AssetFile(asset, configuredRoot = process.cwd()) {
  if (!asset?.path || asset.endpoint !== "source") throw new Error("Unknown local Ultimate B2 asset");
  const root = await realpath(configuredRoot);
  const file = await realpath(path.resolve(root, asset.path));
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Publisher asset path escaped its source root");
  return file;
}

export function getUltimateB2MediaAsset(logicalKey) {
  const asset = getUltimateB2LocalAsset(logicalKey);
  return asset?.endpoint === "media" ? asset : null;
}

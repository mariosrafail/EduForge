import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertPublicBuilderDocument } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { validateBuilderNativeAssetReferences } from "../netlify-sites/ultimate-b2-builder/server/_builder-native-activity-store.js";
import { resolveNativeActivityKind } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { NATIVE_ACTIVITY_KINDS } from "../src/data/native-activities/nativeActivityKinds.js";
import { nativeActivityUsesManagedAssetSlot, nativeVideoAssetRequirements, removeNativeManagedAssetReferenceIfUnused } from "../src/data/native-activities/nativeActivityPublic.js";
import { findTimedTextCue, parseTimedTextSrt, TIMED_TEXT_LIMITS } from "../src/data/timed-media/timedText.js";

const reference = { assetId: "10000000-0000-4000-8000-000000000070", checksumSha256: "7".repeat(64), role: "activity_artwork", slot: "video-companion" };
const cues = [
  { id: "cue-00000000000040008000000000000001", startMs: 0, endMs: 1_900, text: "Opening subtitle" },
  { id: "cue-00000000000040008000000000000002", startMs: 2_000, endMs: 5_000, text: "Closing subtitle" },
];
const video = { kind: "managed-mp4", assetSlot: reference.slot, fileName: "classroom-companion.mp4", byteSize: 136_517, durationMs: 5_840, cues };

test("Video is one optional student-safe common capability across every native kind", () => {
  assert.equal(NATIVE_ACTIVITY_KINDS.includes("video"), false);
  for (const kindName of NATIVE_ACTIVITY_KINDS) {
    const kind = resolveNativeActivityKind(kindName);
    const document = kind.createBlankPublic({ activityId: `${kindName}-video`, title: "Video", placement: { pageId: "page-1" } });
    document.assets = [reference]; document.video = video;
    const normalized = kind.normalizePublic(document);
    assert.deepEqual(normalized.video, video);
    assert.deepEqual(nativeVideoAssetRequirements(normalized), [{ slot: reference.slot, mediaType: "video/mp4", byteSize: video.byteSize, label: "Video MP4" }]);
    assert.doesNotThrow(() => assertPublicBuilderDocument(normalized));
    assert.doesNotMatch(JSON.stringify(normalized), /modelAnswer|correctOption|teacherSolution|previewUrl|https?:\/\//i);
  }
});

test("Video model rejects incomplete, forged, oversized, malformed, and out-of-duration data", () => {
  const kind = resolveNativeActivityKind("open-response");
  const valid = kind.createBlankPublic({ activityId: "open-video", title: "Video", placement: { pageId: "page-1" } });
  valid.assets = [reference]; valid.video = video;
  const mutations = [
    (value) => { value.video.extra = true; },
    (value) => { value.video.url = "https://private.example/video.mp4"; },
    (value) => { value.video.kind = "youtube"; },
    (value) => { value.video.assetSlot = "missing"; },
    (value) => { value.assets[0].role = "teacher_solution"; },
    (value) => { value.video.fileName = "video.webm"; },
    (value) => { value.video.byteSize = 100 * 1024 * 1024 + 1; },
    (value) => { value.video.durationMs = 0; },
    (value) => { value.video.cues = []; },
    (value) => { value.video.cues[1].id = value.video.cues[0].id; },
    (value) => { value.video.cues[1].startMs = 1_000; },
    (value) => { value.video.cues[1].endMs = 6_000; },
    (value) => { value.video.cues[0].text = "<script>alert(1)</script>"; value.video.cues[0].privateAnswer = "secret"; },
  ];
  for (const mutate of mutations) { const invalid = structuredClone(valid); mutate(invalid); assert.throws(() => kind.normalizePublic(invalid)); }
});

test("Video managed asset ownership, media type, and byte size fail closed", async () => {
  const row = { id: reference.assetId, checksum_sha256: reference.checksumSha256, asset_role: reference.role, publication_status: "draft", access_level: "internal", storage_profile: "private", source_metadata: { native_activity_id: "open-video", asset_slot: reference.slot }, mime_type: "video/mp4", byte_size: video.byteSize, width: null, height: null };
  const input = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId: "open-video", assets: [reference], requirements: nativeVideoAssetRequirements({ video }) };
  await assert.doesNotReject(() => validateBuilderNativeAssetReferences(async () => [row], input));
  await assert.rejects(() => validateBuilderNativeAssetReferences(async () => [{ ...row, mime_type: "video/webm" }], input), /media type/);
  await assert.rejects(() => validateBuilderNativeAssetReferences(async () => [{ ...row, byte_size: video.byteSize + 1 }], input), /byte size/);
  await assert.rejects(() => validateBuilderNativeAssetReferences(async () => [{ ...row, source_metadata: { ...row.source_metadata, native_activity_id: "other" } }], input), /not owned/);
});

test("Video asset references remain live until the common video capability is removed", () => {
  const document = { assets: [reference], video, parts: [{ interaction: {} }] };
  assert.equal(nativeActivityUsesManagedAssetSlot(document, reference.slot), true);
  removeNativeManagedAssetReferenceIfUnused(document, reference.slot);
  assert.deepEqual(document.assets, [reference]);
  delete document.video;
  removeNativeManagedAssetReferenceIfUnused(document, reference.slot);
  assert.deepEqual(document.assets, []);
});

test("Shared timed text parser accepts SRT variants and enforces bounded deterministic cues", () => {
  let sequence = 0;
  const parsed = parseTimedTextSrt("\ufeff1\r\n00:00:00.000 --> 00:00:01,500\r\nLine one\r\nLine two\r\n\r\n2\r\n00:00:02,000 --> 00:00:03,000\r\nEnd", { createId: () => `cue-0000000000004000800000000000000${++sequence}` });
  assert.deepEqual(parsed.map(({ startMs, endMs, text }) => ({ startMs, endMs, text })), [{ startMs: 0, endMs: 1_500, text: "Line one\nLine two" }, { startMs: 2_000, endMs: 3_000, text: "End" }]);
  assert.equal(findTimedTextCue(parsed, 2_500)?.text, "End");
  assert.equal(findTimedTextCue(parsed, 1_750), null);
  assert.throws(() => parseTimedTextSrt("x".repeat(TIMED_TEXT_LIMITS.sourceCharacters + 1), { createId: () => cues[0].id }), /too large/);
  const tooMany = Array.from({ length: TIMED_TEXT_LIMITS.cues + 1 }, (_, index) => `${index + 1}\n00:00:00,000 --> 00:00:00,001\nx`).join("\n\n");
  assert.throws(() => parseTimedTextSrt(tooMany, { createId: () => cues[0].id }), /too many cues/);
});

test("Shared video runtime owns captions, custom controls, and the fullscreen shell", async () => {
  const [player, css, presentation] = await Promise.all([
    readFile(new URL("../src/components/native-video/NativeVideoPlayer.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/native-video/nativeVideo.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/native-readable-text/NativeReadableTextPresentation.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(player, /shellRef\.current\.requestFullscreen/);
  assert.doesNotMatch(player, /videoRef\.current\.requestFullscreen/);
  assert.match(player, /document\.fullscreenElement === shellRef\.current/);
  assert.match(player, /findTimedTextCue/);
  assert.match(player, /querySelectorAll\("audio, video"\)/);
  assert.doesNotMatch(player, /dangerouslySetInnerHTML|<track/);
  assert.match(css, /native-video-exit-fullscreen[^}]*opacity:\s*\.34/s);
  assert.match(css, /native-video-exit-fullscreen:hover/);
  assert.match(css, /native-video-exit-fullscreen:focus/);
  assert.match(css, /native-video-player-shell\[data-fullscreen\]/);
  assert.match(css, /--native-video-controls-min-height:\s*54px/);
  assert.match(css, /--native-video-fullscreen-control-gap:\s*12px/);
  assert.match(css, /native-video-exit-fullscreen[^}]*bottom:\s*calc\(max\(16px, env\(safe-area-inset-bottom\)\) \+ var\(--native-video-controls-min-height\) \+ var\(--native-video-fullscreen-control-gap\)\)/s);
  assert.match(presentation, /effectiveView === "video"/);
  assert.match(presentation, /<NativeVideoPlayer/);
});

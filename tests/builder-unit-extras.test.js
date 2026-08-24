import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { nativeChildIdFromUuid } from "../src/data/native-activities/nativeChildIdentity.js";
import { ultimateB2StudentsBookAuthoringPages } from "../src/data/ultimate-b2/studentsBookAuthoringCatalog.js";
import {
  createEmptyUltimateB2UnitExtras,
  normalizePublishedUltimateB2UnitExtras,
  normalizeUltimateB2UnitExtrasDocument,
  projectUltimateB2UnitExtrasForPublication,
} from "../src/data/ultimate-b2/unitExtras.js";

const videoA = nativeChildIdFromUuid("video", "10000000-0000-4000-8000-000000000001");
const videoB = nativeChildIdFromUuid("video", "10000000-0000-4000-8000-000000000002");
const cueA = nativeChildIdFromUuid("cue", "10000000-0000-4000-8000-000000000003");
const assetA = "10000000-0000-4000-8000-000000000004";
const pageA = ultimateB2StudentsBookAuthoringPages.find((page) => page.unitNumber === 1);
const pageB = ultimateB2StudentsBookAuthoringPages.find((page) => page.unitNumber === 1 && page.id !== pageA.id);

function video(id, overrides = {}) {
  return {
    id,
    title: id === videoA ? "Welcome video" : "Extension video",
    assetSlot: id,
    asset: { assetId: assetA, checksumSha256: "a".repeat(64), role: "unit_extra_video", slot: id },
    fileName: "welcome.mp4",
    byteSize: 12_345,
    durationMs: 8_000,
    cues: [],
    ...overrides,
  };
}

function document(videos = [video(videoA)], pages = []) {
  return {
    schemaVersion: "1.0",
    units: [{ unitId: "unit-1", unitNumber: 1, categories: { videos } }],
    pages,
  };
}

test("Unit Extras accepts legacy absence, empty collections, and a required MP4 without SRT", () => {
  assert.deepEqual(normalizeUltimateB2UnitExtrasDocument(createEmptyUltimateB2UnitExtras()), createEmptyUltimateB2UnitExtras());
  const normalized = normalizeUltimateB2UnitExtrasDocument(document());
  assert.deepEqual(normalized.units[0].categories.videos[0].cues, []);
  assert.doesNotThrow(() => projectUltimateB2UnitExtrasForPublication(normalized));
  assert.throws(() => projectUltimateB2UnitExtrasForPublication(document([video(videoA, { asset: null, fileName: "", byteSize: null, durationMs: null })])), /requires a managed MP4/);
});

test("Unit Extras keeps stable authored order and validates one, many, duplicate, and malformed identities", () => {
  const many = normalizeUltimateB2UnitExtrasDocument(document([video(videoB), video(videoA)]));
  assert.deepEqual(many.units[0].categories.videos.map((entry) => entry.id), [videoB, videoA]);
  assert.deepEqual(normalizeUltimateB2UnitExtrasDocument(structuredClone(many)), many);
  assert.throws(() => normalizeUltimateB2UnitExtrasDocument(document([video(videoA), video(videoA)])), /identities must be unique/);
  assert.throws(() => normalizeUltimateB2UnitExtrasDocument({ ...document(), units: [{ unitId: "unit-2", unitNumber: 1, categories: { videos: [] } }] }), /identity is invalid/);
  assert.throws(() => normalizeUltimateB2UnitExtrasDocument({ ...document(), unexpected: true }), /unsupported fields/);
});

test("Page visibility is independently Unit-bound and legacy Pages default off", () => {
  const firstOnly = normalizeUltimateB2UnitExtrasDocument(document([video(videoA)], [
    { pageId: pageA.id, unitId: "unit-1", extrasVisibility: { videos: true } },
    { pageId: pageB.id, unitId: "unit-1", extrasVisibility: { videos: false } },
  ]));
  assert.equal(firstOnly.pages[0].extrasVisibility.videos, true);
  assert.equal(firstOnly.pages[1].extrasVisibility.videos, false);
  assert.equal(normalizeUltimateB2UnitExtrasDocument(document()).pages.length, 0);
  assert.throws(() => normalizeUltimateB2UnitExtrasDocument(document([video(videoA)], [
    { pageId: pageA.id, unitId: "unit-2", extrasVisibility: { videos: true } },
  ])), /does not belong to its Unit/);
});

test("optional normalized SRT is accepted and invalid or out-of-duration cues fail closed", () => {
  const cue = { id: cueA, startMs: 500, endMs: 2_000, text: "Welcome." };
  const projected = projectUltimateB2UnitExtrasForPublication(document([video(videoA, { cues: [cue] })]));
  assert.deepEqual(projected.units[0].categories.videos[0].video.cues, [cue]);
  assert.deepEqual(normalizePublishedUltimateB2UnitExtras(projected), projected);
  assert.throws(() => normalizeUltimateB2UnitExtrasDocument(document([video(videoA, { cues: [{ ...cue, endMs: 9_000 }] })])), /beyond the MP4 duration/);
  assert.throws(() => normalizeUltimateB2UnitExtrasDocument(document([video(videoA, { cues: [{ ...cue, text: "" }] })])), /required/);
});

test("native Activity Video still requires SRT while Unit Extra player hides captions without cues", async () => {
  const [editor, player] = await Promise.all([
    readFile(new URL("../src/apps/book-builder/hosted/NativeVideoEditor.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/native-video/NativeVideoPlayer.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(editor, /video\?\.assetSlot && video\.cues\?\.length && video\.durationMs > 0/);
  assert.match(editor, /SRT subtitles required/);
  assert.match(player, /video\.cues\.length \? <button[^>]*className="native-video-captions"/);
  assert.match(player, /videoRef\.current\?\.play\(\)\.catch/);
});

test("migration 044 owns Unit Extra uploads without fake activities and extends exact source freshness", async () => {
  const migration = await readFile(new URL("../database/044_builder_unit_extra_asset_uploads.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists builder_unit_extra_asset_upload_sessions/);
  assert.match(migration, /foreign key \(unit_id, book_component_id\)[\s\S]*references units\(id, book_component_id\)/);
  assert.match(migration, /prepare_builder_unit_extra_asset_upload[\s\S]*role='developer'/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /claim_builder_unit_extra_asset_upload/);
  assert.match(migration, /complete_builder_unit_extra_asset_upload/);
  assert.match(migration, /fail_builder_unit_extra_asset_upload/);
  assert.match(migration, /session\.book_component_id[\s\S]*session\.unit_id[\s\S]*null,null/);
  assert.match(migration, /asset\.activity_id is not null or existing_asset\.page_id is not null|existing_asset\.activity_id is not null or existing_asset\.page_id is not null/);
  assert.match(migration, /source_snapshot \? 'unitExtras'/);
  assert.match(migration, /document_type='unit_extras' and document_key='default'/);
  assert.doesNotMatch(migration, /insert into activities|alter table book_assets|drop table|drop column/i);
});

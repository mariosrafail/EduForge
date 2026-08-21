import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

import { assertPublicBuilderDocument, builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { validateBuilderNativeAssetReferences } from "../netlify-sites/ultimate-b2-builder/server/_builder-native-activity-store.js";
import { resolveNativeActivityKind } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { removeNativeManagedAssetReferenceIfUnused } from "../src/data/native-activities/nativeActivityPublic.js";
import { createNativeOpenResponseQuestion } from "../src/data/native-activities/nativeOpenResponse.js";

const reference = { assetId: "10000000-0000-4000-8000-000000000004", checksumSha256: "a".repeat(64), role: "activity_artwork", slot: "readable-text" };
const readableText = { kind: "image", assetSlot: reference.slot, sourceWidth: 1000, sourceHeight: 1800, altText: "Readable passage" };
const pageId = "page-1";
const q = "q-00000000000040008000000000000001";

function oldDocuments() {
  const openQuestion = { ...createNativeOpenResponseQuestion(q, 0), prompt: "Prompt 1" };
  const artwork = { ...reference, slot: "asset-one" };
  const base = (activityId, kind, interaction, assets = []) => ({ schemaVersion: "1.0", activityId, kind, metadata: { title: "Compatibility", visibleInstructionText: "" }, placement: { pageId }, assets, parts: [{ id: "part-1", interaction }] });
  return {
    openResponse: base("open-compat", "open-response", { kind: "open-response", surface: { width: 1024, height: 582 }, artwork: [], questions: [openQuestion] }),
    image: base("image-compat", "image", { kind: "image", surface: { width: 1024, height: 582 }, images: [{ id: "img-00000000000040008000000000000001", assetSlot: artwork.slot, area: { x: 0, y: 0, width: 1024, height: 582 }, order: 0, altText: "Diagram", decorative: false, fit: "contain", locked: false }] }, [artwork]),
    textChoice: base("choice-compat", "single-choice", { kind: "single-choice", questions: [{ id: q, prompt: "Question?", options: [{ id: "opt-00000000000040008000000000000001", text: "A" }, { id: "opt-00000000000040008000000000000002", text: "B" }] }] }),
    visualChoice: base("visual-compat", "single-choice", { kind: "single-choice", questions: [{ id: q, prompt: "Question?", options: [{ id: "opt-00000000000040008000000000000001", text: "A" }, { id: "opt-00000000000040008000000000000002", text: "B" }] }], presentation: { kind: "image-hotspot", panels: [{ id: "panel-00000000000040008000000000000001", backgroundAssetSlot: artwork.slot, sourceWidth: 1200, sourceHeight: 800, hotspots: [{ id: "hot-00000000000040008000000000000001", questionId: q, optionId: "opt-00000000000040008000000000000001", area: { x: 100, y: 200, width: 300, height: 120 } }, { id: "hot-00000000000040008000000000000002", questionId: q, optionId: "opt-00000000000040008000000000000002", area: { x: 500, y: 200, width: 300, height: 120 } }] }] } }, [artwork]),
  };
}

test("legacy native canonical documents omit Readable Text and preserve fixed hashes", () => {
  const expected = {
    openResponse: "e70bfded61344025cd16bb6243b91edd84d70c80d4b42a080bf760ddf1efe091",
    image: "ccabdf138c2c782aee981ac50f284152992decd470b8afb1434b0c91d0234189",
    textChoice: "370d125e49355054168f083193ff088daa98dcdfad9aadb6c74b4372c51e40ba",
    visualChoice: "9fb8597f6d6313d05c6c8f8380eec66344ba29e3cd2fc391f2f2776b306ff1e7",
  };
  for (const [name, document] of Object.entries(oldDocuments())) {
    const normalized = resolveNativeActivityKind(document.kind).normalizePublic(document, document.activityId);
    assert.equal(Object.hasOwn(normalized, "readableText"), false);
    assert.equal(builderDocumentSha256(normalized), expected[name]);
  }
});

test("Readable Text is one strict generic student-safe optional managed image contract", () => {
  for (const kindName of ["open-response", "image", "single-choice"]) {
    const kind = resolveNativeActivityKind(kindName);
    const document = kind.createBlankPublic({ activityId: `${kindName}-readable`, title: "Readable", placement: { pageId } });
    document.assets = [reference]; document.readableText = readableText;
    const normalized = kind.normalizePublic(document);
    assert.deepEqual(normalized.readableText, readableText);
    assert.doesNotThrow(() => assertPublicBuilderDocument(normalized));
    assert.doesNotMatch(JSON.stringify(normalized), /correctAnswers|correctOptionId|modelAnswers|teacherSolution|https?:\/\//i);
  }
});

test("Readable Text rejects unknown keys, direct URLs, invalid kind, slot, dimensions, and alt text", () => {
  const kind = resolveNativeActivityKind("open-response");
  const valid = kind.createBlankPublic({ activityId: "open-readable", title: "Readable", placement: { pageId } });
  valid.assets = [reference]; valid.readableText = readableText;
  const mutations = [
    (value) => { value.readableText.extra = true; },
    (value) => { value.readableText.url = "https://private.example/image.png"; },
    (value) => { value.readableText.kind = "html"; },
    (value) => { value.readableText.assetSlot = "missing"; },
    (value) => { value.readableText.sourceWidth = 0; },
    (value) => { value.readableText.sourceHeight = 8_193; },
    (value) => { value.readableText.altText = ""; },
    (value) => { value.readableText.altText = "x".repeat(301); },
  ];
  for (const mutate of mutations) { const invalid = structuredClone(valid); mutate(invalid); assert.throws(() => kind.normalizePublic(invalid)); }
});

test("managed Readable Text dimensions and activity ownership fail closed", async () => {
  const row = { id: reference.assetId, checksum_sha256: reference.checksumSha256, asset_role: reference.role, publication_status: "draft", access_level: "internal", storage_profile: "private", source_metadata: { native_activity_id: "open-readable", asset_slot: reference.slot }, width: 1000, height: 1800 };
  const sql = async () => [row];
  const input = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId: "open-readable", assets: [reference], requirements: [{ slot: reference.slot, width: 1000, height: 1800, label: "Readable Text" }] };
  await assert.doesNotReject(() => validateBuilderNativeAssetReferences(sql, input));
  await assert.rejects(() => validateBuilderNativeAssetReferences(async () => [{ ...row, width: 999 }], input), /Readable Text dimensions/);
  await assert.rejects(() => validateBuilderNativeAssetReferences(async () => [{ ...row, source_metadata: { ...row.source_metadata, native_activity_id: "other" } }], input), /not owned/);
});

test("managed reference cleanup retains a slot until every activity use is removed", () => {
  const document = {
    assets: [reference],
    readableText,
    parts: [{ interaction: { images: [{ assetSlot: reference.slot }] } }],
  };
  removeNativeManagedAssetReferenceIfUnused(document, reference.slot);
  assert.deepEqual(document.assets, [reference]);
  delete document.readableText;
  removeNativeManagedAssetReferenceIfUnused(document, reference.slot);
  assert.deepEqual(document.assets, [reference]);
  document.parts[0].interaction.images = [];
  removeNativeManagedAssetReferenceIfUnused(document, reference.slot);
  assert.deepEqual(document.assets, []);
});

test("shared Builder and Teacher runtime wire all native kinds without duplicating private data or toolbars", async () => {
  const files = await Promise.all([
    "NativeOpenResponseEditor.jsx", "NativeImageEditor.jsx", "NativeSingleChoiceEditor.jsx",
  ].map((name) => readFile(new URL(`../src/apps/book-builder/hosted/${name}`, import.meta.url), "utf8")));
  files.forEach((source) => assert.match(source, /<NativeReadableTextEditor/));
  const shared = await readFile(new URL("../src/apps/book-builder/hosted/NativeReadableTextEditor.jsx", import.meta.url), "utf8");
  assert.match(shared, /uploadNativeActivityAsset/); assert.match(shared, /Upload a readable-text image/); assert.doesNotMatch(shared, /teacherDocument|correctAnswer|modelAnswer/);
  const pages = await readFile(new URL("../src/apps/android-teacher-offline/TeacherOfflinePages.jsx", import.meta.url), "utf8");
  assert.match(pages, /videoAvailable \? \[\{/); assert.match(pages, /!listeningAvailable && \(activityPresentationState\.readableTextAvailable \|\| \(!videoAvailable/); assert.match(pages, /activeIconName: "showTextPressed"/);
});

test("native Readable Text presentation toggles only when available and uses bounded internal scrolling", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { nextNativeReadableTextView } = await vite.ssrLoadModule("/src/components/native-readable-text/NativeReadableTextPresentation.jsx");
    assert.equal(nextNativeReadableTextView("questions", "toggle-text", true), "text");
    assert.equal(nextNativeReadableTextView("text", "toggle-text", true), "questions");
    assert.equal(nextNativeReadableTextView("questions", "toggle-text", false), "questions");
    assert.equal(nextNativeReadableTextView("questions", "next-panel", true), "questions");
  } finally { await vite.close(); }
  const [component, css] = await Promise.all([
    readFile(new URL("../src/components/native-readable-text/NativeReadableTextPresentation.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/native-readable-text/nativeReadableText.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /hidden=\{effectiveView === "text"\}/); assert.match(component, /scrollHeight > viewport\.clientHeight/); assert.match(component, /SCROLL ↓/);
  assert.match(css, /overflow: auto/); assert.match(css, /overscroll-behavior: contain/); assert.match(css, /width: 100%; height: auto/); assert.match(css, /pointer-events: none/);
});

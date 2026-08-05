import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { attachManualActivityAsset, createManualActivityAssetCatalog, publicManualActivityAssetCatalog } from "../lib/book-builder/manual-activity-assets.js";
import { createManualHierarchyResolver, manualHierarchyFromOwnership } from "../lib/book-builder/manual-activity-hierarchy.js";
import { prefillManualActivityFromDetectedCandidate, refreshManualActivityStaleness } from "../lib/book-builder/manual-activity-prefill.js";
import { effectiveReviewWithManualActivities } from "../lib/book-builder/manual-activity-reviews.js";
import { resolveManualActivityMediaAssets } from "../scripts/book-builder/manual-activity-asset-content.mjs";

const sha = "a".repeat(64); const now = "2026-08-06T14:00:00.000Z";
const component = { sourceBookRootId: "bookroot_one", componentKey: "component_students", effectiveRole: "students_book", unitGroups: [{ unitKey: "unit_students_3", sourceNumber: 3 }] };
const ownership = { resolved: true, sourceBookRootId: "bookroot_one", componentKey: "component_students", effectiveRole: "students_book", unitKey: "unit_students_3", sourceNumber: 3 };

test("asset catalog produces opaque allowlisted references and rejects paths, stale assets and incompatible roles", () => {
  const catalog = createManualActivityAssetCatalog({ pages: { spreads: [{ variants: [{ sourceRelativePath: "Pages/unit-3.png", sha256: sha, width: 1000, height: 2400 }] }] }, media: { candidates: [{ sourceRelativePath: "Media/listen.mp3", sourceSha256: "b".repeat(64) }, { sourceRelativePath: "C:\\private\\bad.mp4", sourceSha256: sha }] } });
  assert.equal(catalog.size, 2); const assets = publicManualActivityAssetCatalog(catalog); assert.match(assets[0].assetId, /^manual_asset_[a-f0-9]{24}$/); assert.doesNotMatch(JSON.stringify(assets), /C:\\private/);
  const image = assets.find((item) => item.mimeType === "image/png"); assert.equal(attachManualActivityAsset(catalog, image.assetId, "background").sourceRelativeIdentity, "Pages/unit-3.png"); assert.throws(() => attachManualActivityAsset(catalog, image.assetId, "audio")); assert.throws(() => attachManualActivityAsset(catalog, "missing"));
});

test("deferred detected media is resolved to a current digest through the bound source allowlist", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hhplms-manual-media-")); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, "project"); const source = path.join(root, "source.app"); const mediaPath = path.join(source, "Contents", "Resources", "audio", "listen.mp3");
  await fs.mkdir(path.dirname(mediaPath), { recursive: true }); await fs.mkdir(project); await fs.writeFile(mediaPath, Buffer.from("fixture audio"));
  await fs.writeFile(path.join(project, "local-source-binding.json"), JSON.stringify({ canonicalApplicationRealPath: source }));
  const assets = await resolveManualActivityMediaAssets(project, { candidates: [{ type: "audio", byteSize: 13, mimeCandidate: "audio/mpeg", sourceRelativePath: "Contents/Resources/audio/listen.mp3", owningStructureCandidate: { unit: 1 } }, { type: "audio", byteSize: 1, mimeCandidate: "audio/mpeg", sourceRelativePath: "../outside.mp3" }] });
  assert.equal(assets.length, 1); assert.equal(assets[0].role, "audio"); assert.match(assets[0].sha256, /^[a-f0-9]{64}$/); assert.equal(assets[0].sourceRelativePath, "Contents/Resources/audio/listen.mp3");
});

test("hierarchy validation is parent-scoped and rejects same-number cross-component attachment", () => {
  const workbook = { sourceBookRootId: "bookroot_one", componentKey: "component_workbook", effectiveRole: "workbook", unitGroups: [{ unitKey: "unit_workbook_3", sourceNumber: 3 }] };
  const resolver = createManualHierarchyResolver({ components: [component, workbook] }, { pages: [{ candidateId: "page_students_3", hierarchy: { componentKey: component.componentKey, unitKey: "unit_students_3" } }], hotspots: [{ candidateId: "hotspot_students", componentKey: component.componentKey, unitKey: "unit_students_3" }] });
  const valid = manualHierarchyFromOwnership(ownership, { part: 1, pageCandidateId: "page_students_3", hotspotCandidateIds: ["hotspot_students"] }); assert.equal(resolver(valid), true);
  assert.match(resolver({ ...valid, componentKey: workbook.componentKey, effectiveComponentRole: "workbook", unitGroupKey: "unit_workbook_3" }), /page does not belong/);
});

test("detected prefill copies only Student-safe evidence with new stable IDs and no Teacher values", () => {
  const candidate = { activityCandidateId: "candidate_fiction", sourceObjectLocator: "Books/book1/course/3/part1/obj1", normalizedCandidateType: "multiple-choice", displayTitle: "Detected title", instructions: "Choose.", questions: [{ id: "detected_question", prompt: "Which?", options: [{ id: "detected_a", text: "Amber" }, { id: "detected_b", text: "Blue" }], correctOptionIds: ["detected_b"] }] };
  const fact = { id: "fact_candidate", sourceLocator: `${candidate.sourceObjectLocator}/question`, evidenceHash: sha };
  const draft = prefillManualActivityFromDetectedCandidate({ candidate, hierarchy: manualHierarchyFromOwnership(ownership), detectedFacts: [fact], now });
  assert.equal(draft.status, "draft"); assert.equal(draft.sourceCandidateId, candidate.activityCandidateId); assert.notEqual(draft.content.questions[0].id, "detected_question"); assert.doesNotMatch(JSON.stringify(draft), /correctOptionIds|teacherSolution|acceptedAnswers/); assert.deepEqual(draft.dependencyFactIds, [fact.id]);
});

test("source and asset changes stale bindings without replacing manual content", () => {
  const candidate = { activityCandidateId: "candidate_fiction", sourceObjectLocator: "Books/book1/course/3/part1/obj1", normalizedCandidateType: "open-answer", instructions: "Original prompt" }; const fact = { id: "fact_candidate", sourceLocator: candidate.sourceObjectLocator, evidenceHash: sha };
  const draft = prefillManualActivityFromDetectedCandidate({ candidate, hierarchy: manualHierarchyFromOwnership(ownership), detectedFacts: [fact], now }); draft.content.prompt = "Publisher-authored prompt";
  const stale = refreshManualActivityStaleness(draft, { detectedFacts: [{ ...fact, evidenceHash: "b".repeat(64) }] }); assert.equal(stale.stale, true); assert.equal(stale.content.prompt, "Publisher-authored prompt"); assert.deepEqual(stale.staleReasons, ["dependency_changed:fact_candidate"]);
});

test("only an approved complete explicit replacement resolves review and archive/stale reopens it", () => {
  const activity = { schemaVersion: "1.0", activityId: "manual_open", status: "approved", sourceMode: "manual", replacesCandidateId: "candidate_fiction", hierarchy: manualHierarchyFromOwnership(ownership), type: "open_answer", title: "Approved", instructions: "", content: { prompt: "Explain.", responseGuidance: "" }, presentation: { viewportMode: "fit", viewportSizeMode: "responsive", backgroundReviewRequired: false }, assetReferences: [], dependencyFactIds: [], dependencyEvidenceHashes: {}, stale: false, staleReasons: [], createdAt: now, updatedAt: now };
  const review = { id: "review_one", activityCandidateId: "candidate_fiction", status: "open" }; const resolved = effectiveReviewWithManualActivities(review, [activity], [], { hierarchyResolver: () => true }); assert.equal(resolved.effectiveStatus, "resolved_by_manual_activity");
  assert.equal(effectiveReviewWithManualActivities(review, [{ ...activity, status: "draft" }], [], { hierarchyResolver: () => true }).effectiveStatus, "open"); assert.equal(effectiveReviewWithManualActivities(review, [{ ...activity, stale: true }], [], { hierarchyResolver: () => true }).effectiveStatus, "open");
});

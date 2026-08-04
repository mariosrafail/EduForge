import assert from "node:assert/strict";
import test from "node:test";
import {
  createBookProject,
  portableBookProject,
  projectPublicationManifest,
  serializeBookProject,
  validateBookProject,
  validatePublicationDraft,
} from "../lib/book-builder/book-project.js";
import { createDetectedFact } from "../lib/book-builder/detected-facts.js";
import { applyRescan, diffDetectedFacts } from "../lib/book-builder/rescan-diff.js";

const timestamp = "2026-08-05T00:00:00.000Z";

function fact(value = "before", locator = "Contents/Resources/assets/books/book1") {
  return createDetectedFact({
    kind: "component_directory_candidate",
    locator,
    value: { name: value },
    parserId: "fixture",
    parserVersion: "1.0",
    evidence: [{ source: locator }],
  });
}

function project(overrides = {}) {
  return createBookProject({
    projectId: "fixture-book",
    lifecycleStatus: "scanned",
    now: timestamp,
    sourceDescriptor: { label: "Fictional Book.app", kind: "air_application", canonicalAppRelativePath: "." },
    sourceSnapshot: { inventoryFingerprint: "a".repeat(64), scannedAt: timestamp, fileCount: 3, totalBytes: 30 },
    selectedProfile: { id: "generic-air-fallback", confidence: 0.4, detectorVersion: "1.0", matchedEvidence: [], missingEvidence: ["iwb"], conflictingEvidence: [] },
    publicationDraft: { schemaVersion: "1.0" },
    ...overrides,
  });
}

test("Book Project accepts incomplete drafts but strict publication validation remains unchanged", () => {
  const value = project();
  assert.deepEqual(validateBookProject(value), { valid: true, errors: [] });
  const publication = validatePublicationDraft(value);
  assert.equal(publication.valid, false);
  assert.match(publication.errors.join("\n"), /publisher|components|assets/);
});

test("Book Project rejects unknown fields, versions, unsafe IDs, and absolute portable paths", () => {
  const value = project();
  assert.equal(validateBookProject({ ...value, surprise: true }).valid, false);
  assert.equal(validateBookProject({ ...value, schemaVersion: "2.0" }).valid, false);
  assert.equal(validateBookProject({ ...value, projectId: "../escape" }).valid, false);
  assert.equal(validateBookProject({ ...value, sourceDescriptor: { ...value.sourceDescriptor, selectedOuterPath: "C:\\Users\\fixture\\book" } }).valid, false);
});

test("portable export is deterministic and cannot contain a local binding", () => {
  const value = project({ detectedFacts: [fact()] });
  assert.equal(serializeBookProject(value), serializeBookProject(value));
  assert.equal(serializeBookProject(value).endsWith("\n"), true);
  assert.equal(JSON.stringify(portableBookProject(value)).includes("local-source-binding"), false);
});

test("publication projection emits only canonical manifest fields", () => {
  const value = project({ publicationDraft: { schemaVersion: "1.0", publisher: { id: "p" }, confidence: 0.9, sourceInventory: [1] } });
  assert.deepEqual(projectPublicationManifest(value), { publisher: { id: "p" }, schemaVersion: "1.0" });
});

test("fact IDs remain stable while evidence hashes classify changes", () => {
  const before = fact("before");
  const after = fact("after");
  assert.equal(before.id, after.id);
  assert.notEqual(before.evidenceHash, after.evidenceHash);
  assert.equal(diffDetectedFacts([before], [after]).changed.length, 1);
});

test("rescan invalidates only dependent decisions and preserves stale decisions", () => {
  const before = fact("before");
  const unrelated = fact("same", "Contents/Resources/assets/books/book2");
  const after = fact("after");
  const decisions = [
    { id: "component-role", kind: "component_role", value: "students_book", dependencyFactIds: [before.id], dependencyEvidenceHashes: { [before.id]: before.evidenceHash }, approvalState: "approved", stale: false, staleReasons: [], editorNote: "", createdAt: timestamp, updatedAt: timestamp },
    { id: "unrelated-role", kind: "component_role", value: "workbook", dependencyFactIds: [unrelated.id], dependencyEvidenceHashes: { [unrelated.id]: unrelated.evidenceHash }, approvalState: "approved", stale: false, staleReasons: [], editorNote: "", createdAt: timestamp, updatedAt: timestamp },
  ];
  const first = applyRescan({ previousFacts: [before, unrelated], nextFacts: [after, unrelated], approvedDecisions: decisions });
  assert.deepEqual(first.staleDecisionIds, ["component-role"]);
  assert.equal(first.decisions.find((item) => item.id === "unrelated-role").stale, false);
  const second = applyRescan({ previousFacts: [after, unrelated], nextFacts: [after, unrelated], approvedDecisions: first.decisions });
  assert.equal(second.diff.changed.length, 0);
  assert.deepEqual(second.decisions, first.decisions);
});

test("removed facts stale every dependant while added facts do not override decisions", () => {
  const before = fact();
  const added = fact("new", "Contents/Resources/assets/books/book3");
  const decision = { id: "role", kind: "component_role", value: "students_book", dependencyFactIds: [before.id], dependencyEvidenceHashes: { [before.id]: before.evidenceHash }, approvalState: "approved", stale: false, staleReasons: [], editorNote: "", createdAt: timestamp, updatedAt: timestamp };
  const removed = applyRescan({ previousFacts: [before], nextFacts: [added], approvedDecisions: [decision] });
  assert.equal(removed.diff.added.length, 1);
  assert.equal(removed.diff.removed.length, 1);
  assert.equal(removed.decisions[0].stale, true);
  assert.match(removed.decisions[0].staleReasons[0], /dependency_removed/);
});

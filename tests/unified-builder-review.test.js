import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  activityReviewIntent,
  pageReviewIntent,
  productDraftReviewIntent,
  publicationReadinessPresentation,
  resolveUnifiedReviewIntent,
} from "../src/apps/ultimate-b2-builder/builderReviewModel.js";
import { hostedBuilderReviewHash, parseHostedBuilderHash } from "../src/apps/book-builder/hosted/hostedBuilderRouter.js";
import { pageLibraryReviewNavigation } from "../src/apps/book-builder/hosted/pageLibraryReviewModel.js";

const page = { pageId: "ub2-sb-unit-1-part-1", unitNumber: 1 };
const release = { id: "10000000-0000-4000-8000-000000000012", number: 12, state: "stale" };

test("unified review enters one product library for every saved draft and preserves immutable release page intent", () => {
  assert.deepEqual(activityReviewIntent("ultimate-b2-sb-u1-p1-o90"), { view: "activity", activityId: "ultimate-b2-sb-u1-p1-o90" });
  assert.deepEqual(activityReviewIntent("ultimate-b2-sb-u1-p1-o90", page), { view: "activity", activityId: "ultimate-b2-sb-u1-p1-o90", unitNumber: 1, pageId: page.pageId });
  assert.deepEqual(pageReviewIntent(page), { view: "page", unitNumber: 1, pageId: page.pageId });
  assert.deepEqual(productDraftReviewIntent(), { view: "library" });
  assert.deepEqual(resolveUnifiedReviewIntent({ sourceMode: "draft", toolContext: { view: "activity", activityId: "ultimate-b2-sb-u1-p1-o90", unitNumber: 1, pageId: page.pageId }, page, release }), { view: "library" });
  assert.deepEqual(resolveUnifiedReviewIntent({ sourceMode: "draft", toolContext: { view: "page" }, page, release }), { view: "library" });
  assert.deepEqual(resolveUnifiedReviewIntent({ sourceMode: "draft", toolContext: { view: "page" }, page: null, release }), { view: "library" });
  assert.deepEqual(resolveUnifiedReviewIntent({ sourceMode: "release", toolContext: { view: "page" }, page, release }), { view: "page", unitNumber: 1, pageId: page.pageId, productReleaseId: release.id });
  assert.equal(resolveUnifiedReviewIntent({ sourceMode: "release", toolContext: { view: "page" }, page, release: null }), null);
});

test("resolved draft and release intents create deterministic token-free Builder Player URLs", () => {
  const identity = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" };
  const draftIntent = resolveUnifiedReviewIntent({ sourceMode: "draft", toolContext: { view: "activity", activityId: "ultimate-b2-sb-u1-p1-o90", unitNumber: 1, pageId: page.pageId }, page, release });
  const releaseIntent = resolveUnifiedReviewIntent({ sourceMode: "release", toolContext: { view: "page" }, page, release });
  for (const intent of [draftIntent, releaseIntent]) {
    const hash = hostedBuilderReviewHash({ ...identity, intent });
    assert.deepEqual(parseHostedBuilderHash(hash), { kind: "review", ...identity, intent });
    assert.doesNotMatch(hash, /previewAuthorization|token|secret/i);
  }
  assert.match(hostedBuilderReviewHash({ ...identity, intent: releaseIntent }), new RegExp(`productReleaseId=${release.id}$`));
});

test("publication readiness errors retain safe actionable activity issues", () => {
  assert.deepEqual(publicationReadinessPresentation({ code: "native_activity_not_ready", payload: { activityId: "ultimate-b2-sb-u1-p1-o90", issues: ["Question 1 needs a model answer.", "Question 1 needs a model answer."] } }), {
    title: "Publication blocked",
    activityId: "ultimate-b2-sb-u1-p1-o90",
    issues: ["Question 1 needs a model answer."],
  });
  assert.deepEqual(publicationReadinessPresentation({ payload: { error: "native_activity_pair_invalid", activityId: "../../secret", issues: [] } }), {
    title: "Publication blocked",
    activityId: null,
    issues: ["The referenced native activity is not ready to publish."],
  });
  assert.equal(publicationReadinessPresentation({ code: "builder_publication_failed" }), null);
});

function managedLibrary(componentSlug, prefix) {
  const units = [{ id: `${prefix}-unit-id`, slug: "unit-1", title: "Unit 1", unitNumber: 1, sortOrder: 10 }];
  return {
    component: { bookSlug: "ultimate-b2", componentSlug, kind: "managed" }, units,
    pages: [2, 1].map((number) => ({ id: `${prefix}-page-${number}`, componentSlug, unitId: units[0].id, label: `${prefix.toUpperCase()} page ${number}`, printedLabel: String(number), sortOrder: number * 10 })),
  };
}

test("Page Library Review navigation is deterministic and component-scoped", () => {
  const workbookLibrary = managedLibrary("ultimate-b2-workbook", "wb");
  workbookLibrary.pages.forEach((candidate) => { candidate.sortOrder = 10; });
  const workbook = pageLibraryReviewNavigation(workbookLibrary, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook" });
  const grammar = pageLibraryReviewNavigation(managedLibrary("ultimate-b2-grammar-book", "gb"), { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-grammar-book" });
  assert.deepEqual(workbook.placements.map((item) => item.pageId), ["wb-page-1", "wb-page-2"]);
  assert.deepEqual(grammar.placements.map((item) => item.pageId), ["gb-page-1", "gb-page-2"]);
  assert.equal(workbook.placements.some((item) => item.pageId.startsWith("gb-")), false);
  assert.throws(() => pageLibraryReviewNavigation(managedLibrary("ultimate-b2-workbook", "wb"), { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-grammar-book" }), /identity/);
});

test("only the shared Review owner mounts the external hosted Viewer", async () => {
  const files = [
    "src/apps/ultimate-b2-builder/HostedUltimateB2BuilderApp.jsx",
    "src/apps/ultimate-b2-builder/HostedUltimateB2HotspotBuilder.jsx",
    "src/apps/ultimate-b2-builder/HostedTeacherUiController.jsx",
    "src/apps/ultimate-b2-builder/HostedPublicationWorkspace.jsx",
  ];
  for (const file of files) assert.doesNotMatch(await readFile(file, "utf8"), /<HostedViewerPreview\b/);
  const shared = await readFile("src/apps/ultimate-b2-builder/UnifiedBuilderReview.jsx", "utf8");
  assert.equal(shared.match(/<HostedViewerPreview\b/g)?.length, 1);
  assert.match(shared, /Unsaved changes are not included in Review\. Save them first\./);
  assert.match(shared, /Release #\{release\.number\} is immutable and older than the current saved draft\./);
  assert.match(shared, /session\.sourceMode === "release" && intent\?\.view === "page"/);
  assert.match(shared, /product-library/);
  assert.match(shared, /openPlayerHref=\{hostedBuilderReviewHash/);
  assert.doesNotMatch(shared, /previewAuthorization/);
  const pages = await readFile("src/apps/book-builder/hosted/ComponentPagesWorkspace.jsx", "utf8");
  assert.match(pages, /\{reviewAction\}/);
  assert.doesNotMatch(pages, />Save<|Save pages|global Save/i);
  const app = await readFile("src/apps/ultimate-b2-builder/HostedUltimateB2BuilderApp.jsx", "utf8");
  assert.match(app, /type="button" onClick=\{openReview\}>Review<\/button>/);
  assert.doesNotMatch(app, /disabled=\{!selectedPageId\}/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { compilePublicationV2Fixture, publicationV2Fixture } from "./fixtures/publication-v2.js";
import { publishedBookReadModel, resolvePublishedBookLocator } from "../netlify/functions/_book-content/published-book-model.js";
import { nativeAssignmentCapability } from "../netlify/functions/_book-content/native-assignment-runtime.js";
import { publishedManagedBookFixture } from "./fixtures/published-managed-book.js";
import { releaseBookModel } from "../netlify/functions/_book-content/published-book-actions.js";
import { resolvePublishedAssignmentBookContext as resolveStudentAssignmentBookContext } from "../src/components/lms/student/portal/publishedAssignmentBookContext.js";
import { homeworkItemSelection, homeworkItemRequest } from "../src/components/lms/teacher/homeworkUiModel.js";

function model() {
  const compiled = compilePublicationV2Fixture();
  const projection = compiled.publicProjection;
  const capabilities = Object.fromEntries(Object.entries(projection.nativeActivities).map(([id, entry]) => [id, nativeAssignmentCapability(entry.kind, entry.document)]));
  const row = { id: "10000000-0000-4000-8000-000000000099", release_number: 2, package_slug: "ultimate-b2", component_slug: "ultimate-b2-students-book" };
  return { row, projection, capabilities, book: publishedBookReadModel(row, projection, capabilities) };
}

test("published navigation uses the release hotspots and canonical printed labels without activity or Teacher documents", () => {
  const { book, projection } = model();
  const activity = book.activities.find((item) => item.target.nativeActivityId === publicationV2Fixture.openResponseId);
  const page = book.pages.find((item) => item.id === publicationV2Fixture.pageId);
  assert.equal(page.printedLabel, "5");
  assert.equal(page.media.length, 2);
  assert.equal(page.media[0].kind, "video");
  assert.equal(page.media[0].video.cues[0].text, "Published Unit Extra caption.");
  assert.ok(page.image.logicalKey);
  assert.equal(activity.assignable, true);
  assert.equal(activity.placements.length, 1);
  const hotspot = page.hotspots.find((item) => item.activityId === publicationV2Fixture.openResponseId);
  assert.equal(hotspot.id, projection.hotspots.pages[page.id].find((item) => item.activityKey === publicationV2Fixture.openResponseId).id);
  assert.equal(hotspot.target.releaseId, book.releaseId);
  assert.equal(resolvePublishedBookLocator(book, publicationV2Fixture.openResponseId).pageId, page.id);
  assert.doesNotMatch(JSON.stringify(book), /PHASE_5_PRIVATE_TEACHER_SENTINEL|modelAnswer|correctAnswers|"document"/);
  assert.equal(book.activities.find((item) => item.type === "image").assignable, false);
});

test("multiple placements retain one target, require an explicit locator, and reject another activity's locator", () => {
  const { row, projection, capabilities } = model();
  const hotspots = projection.hotspots.pages[publicationV2Fixture.pageId];
  const first = hotspots.find((item) => item.activityKey === publicationV2Fixture.openResponseId);
  hotspots.push({ ...first, id: "additional-published-hotspot" });
  const book = publishedBookReadModel(row, projection, capabilities);
  const activities = book.activities.filter((item) => item.target.nativeActivityId === publicationV2Fixture.openResponseId);
  assert.equal(activities.length, 1);
  assert.equal(activities[0].placements.length, 2);
  assert.equal(resolvePublishedBookLocator(book, publicationV2Fixture.openResponseId), null);
  assert.equal(resolvePublishedBookLocator(book, publicationV2Fixture.openResponseId, { pageId: first.pageId, hotspotId: "additional-published-hotspot" }).hotspotId, "additional-published-hotspot");
  assert.throws(() => resolvePublishedBookLocator(book, publicationV2Fixture.imageId, { pageId: first.pageId, hotspotId: first.id }), /locator_mismatch/);
});

test("unknown components and contradictory published page identities fail closed", () => {
  const { row, projection, capabilities } = model();
  assert.throws(() => publishedBookReadModel({ ...row, component_slug: "unknown-book" }, projection, capabilities), /identity_mismatch/);
  assert.throws(() => publishedBookReadModel(row, { ...projection, activePageIds: ["unknown-page"] }, capabilities), /page_identity_mismatch/);
});

test("canonical Workbook and Grammar pages with identical printed labels preserve exact component and activity identities", () => {
  const books = ["ultimate-b2-workbook", "ultimate-b2-grammar-book"].map((componentSlug, index) => {
    const compiled = publishedManagedBookFixture(componentSlug);
    return releaseBookModel({ row: { id: `10000000-0000-4000-8000-00000000000${index + 1}`, release_number: 1, package_slug: "ultimate-b2", component_slug: componentSlug }, verified: compiled });
  });
  assert.equal(books[0].pages[0].printedLabel, books[1].pages[0].printedLabel);
  assert.notEqual(books[0].pages[0].hotspots[0].target.nativeActivityId, books[1].pages[0].hotspots[0].target.nativeActivityId);
  for (const book of books) {
    const hotspot = book.pages[1].hotspots[0];
    const context = resolveStudentAssignmentBookContext({ book, bookLocator: hotspot.target.locator, target: { ...hotspot.target, publication: { componentSlug: book.componentSlug, bookSlug: book.bookSlug } } });
    assert.equal(context.pageId, book.pages[1].id);
    assert.equal(context.componentId, book.componentSlug);
    assert.equal(context.hotspotId, hotspot.id);
    assert.doesNotMatch(JSON.stringify(book), /PRIVATE_TEACHER|modelAnswers/);
    const invalid = resolveStudentAssignmentBookContext({ book, bookLocator: { pageId: "wrong-page", hotspotId: hotspot.id }, target: hotspot.target });
    assert.equal(invalid.pageId, null);
  }
});

test("editing a Homework preserves its historical locator even when the active option has a different placement", () => {
  const item = { targetKind: "published_native", nativeReleaseId: "10000000-0000-4000-8000-000000000099", nativeActivityId: "native-example", bookLocator: { pageId: "original-page", hotspotId: "original-hotspot" } };
  const id = `published_native:${item.nativeReleaseId}:${item.nativeActivityId}`;
  const selected = homeworkItemSelection(item, [{ id, targetKind: item.targetKind, target: { kind: item.targetKind, releaseId: item.nativeReleaseId, nativeActivityId: item.nativeActivityId, locator: { pageId: "other-page", hotspotId: "other-hotspot" } } }]);
  assert.deepEqual(homeworkItemRequest(selected).locator, item.bookLocator);
});

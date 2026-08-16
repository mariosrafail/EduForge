import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createHostedBuilderCatalog,
  findHostedBuilderBook,
  findHostedBuilderComponent,
  hostedBuilderCatalog,
} from "../src/apps/book-builder/hosted/hostedBuilderCatalog.js";
import {
  hostedBuilderHash,
  hostedBuilderReviewHash,
  parseHostedBuilderHash,
} from "../src/apps/book-builder/hosted/hostedBuilderRouter.js";
import { PHASE_ONE_VISIBLE_COMPONENTS } from "../src/config/bookCatalogVisibility.js";

const read = (file) => readFile(file, "utf8");

test("hosted authoring catalog registers all known titles and Ultimate B2 exact established components", () => {
  assert.deepEqual(hostedBuilderCatalog.map(({ slug }) => slug), ["ultimate-b1", "ultimate-b1-plus", "ultimate-b2"]);
  const book = findHostedBuilderBook("ultimate-b2");
  assert.deepEqual({ slug: book.slug, title: book.title, level: book.level, status: book.status }, {
    slug: "ultimate-b2", title: "Ultimate B2", level: "B2", status: "In authoring",
  });
  assert.deepEqual(book.components.map(({ slug, type }) => ({ slug, type })), [
    { slug: "ultimate-b2-students-book", type: "students_book" },
    { slug: "ultimate-b2-workbook", type: "workbook" },
    { slug: "ultimate-b2-grammar-book", type: "grammar_book" },
    { slug: "ultimate-b2-test-book", type: "test_book" },
  ]);
  assert.equal(findHostedBuilderComponent(book, "ultimate-b2-students-book").adapterId, "ultimate-b2-students-book");
  for (const slug of ["ultimate-b2-workbook", "ultimate-b2-grammar-book", "ultimate-b2-test-book"]) {
    const component = findHostedBuilderComponent(book, slug);
    assert.equal(component.adapterId, null);
    assert.equal(component.status, "Authoring adapter pending");
  }
});

test("hosted authoring catalog is independent from LMS Phase One component hiding", () => {
  const builderSlugs = findHostedBuilderBook("ultimate-b2").components.map(({ slug }) => slug);
  assert.ok(builderSlugs.includes("ultimate-b2-grammar-book"));
  assert.ok(builderSlugs.includes("ultimate-b2-test-book"));
  assert.equal(PHASE_ONE_VISIBLE_COMPONENTS["ultimate-b2"].includes("ultimate-b2-grammar-book"), false);
  assert.equal(PHASE_ONE_VISIBLE_COMPONENTS["ultimate-b2"].includes("ultimate-b2-test-book"), false);
});

test("hosted catalog rejects duplicate book and component identities", () => {
  const book = findHostedBuilderBook("ultimate-b2");
  assert.throws(() => createHostedBuilderCatalog([book, book]), /duplicate hosted Builder book/i);
  assert.throws(() => createHostedBuilderCatalog([{ ...book, components: [book.components[0], book.components[0]] }]), /duplicate hosted Builder component/i);
});

test("generic hosted routing is deterministic and fails closed", () => {
  assert.deepEqual(parseHostedBuilderHash("#/books"), { kind: "library" });
  assert.deepEqual(parseHostedBuilderHash("#/books/ultimate-b2"), { kind: "book", bookSlug: "ultimate-b2" });
  assert.deepEqual(parseHostedBuilderHash("#/books/ultimate-b2/components/ultimate-b2-students-book"), {
    kind: "workspace", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", tool: "hotspots",
  });
  assert.deepEqual(parseHostedBuilderHash("#/books/ultimate-b2/components/ultimate-b2-students-book/activities"), {
    kind: "workspace", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", tool: "activities",
  });
  assert.equal(parseHostedBuilderHash("#/books/unknown").bookSlug, "unknown");
  assert.deepEqual(parseHostedBuilderHash("#/books/ultimate-b2/invalid"), { kind: "not-found" });
  assert.deepEqual(parseHostedBuilderHash("#/books/ultimate-b2/components/unknown/delete"), { kind: "not-found" });
  assert.equal(hostedBuilderHash({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", tool: "ui" }), "#/books/ultimate-b2/components/ultimate-b2-students-book/ui");
});

test("generic hosted Review routing round-trips strict token-free Viewer intents", () => {
  const identity = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" };
  const releaseId = "10000000-0000-4000-8000-000000000012";
  const intents = [
    { view: "library" },
    { view: "page", unitNumber: 1, pageId: "ub2-sb-unit-1-part-1" },
    { view: "activity", activityId: "ultimate-b2-sb-u1-p1-o8" },
    { view: "activity", activityId: "ultimate-b2-sb-u1-p1-o8", unitNumber: 1, pageId: "ub2-sb-unit-1-part-1" },
    { view: "page", unitNumber: 1, pageId: "ub2-sb-unit-1-part-1", releaseId },
  ];
  for (const intent of intents) {
    const hash = hostedBuilderReviewHash({ ...identity, intent });
    assert.deepEqual(parseHostedBuilderHash(hash), { kind: "review", ...identity, intent });
    assert.doesNotMatch(hash, /previewAuthorization|token|secret/i);
  }
  assert.equal(hostedBuilderReviewHash({ ...identity, intent: intents[1] }), "#/books/ultimate-b2/components/ultimate-b2-students-book/review?view=page&unitNumber=1&pageId=ub2-sb-unit-1-part-1");
});

test("generic hosted Review routing rejects malformed and over-scoped input", () => {
  const base = "#/books/ultimate-b2/components/ultimate-b2-students-book/review";
  const invalid = [
    `${base}`,
    `${base}?view=unknown`,
    `${base}?view=page&unitNumber=1`,
    `${base}?view=page&unitNumber=0&pageId=ub2-sb-unit-1-part-1`,
    `${base}?view=page&unitNumber=01&pageId=ub2-sb-unit-1-part-1`,
    `${base}?view=activity&activityId=javascript%3Aalert%281%29`,
    `${base}?view=activity&activityId=ultimate-b2-sb-u1-p1-o8&pageId=ub2-sb-unit-1-part-1`,
    `${base}?view=activity&activityId=ultimate-b2-sb-u1-p1-o8&unitNumber=1`,
    `${base}?view=library&view=page`,
    `${base}?view=library&unknown=value`,
    `${base}?view=library&previewAuthorization=secret`,
    `${base}?view=library&token=secret`,
    `${base}?view=library&releaseId=latest`,
    `${base}?view=%E0%A4%A`,
    "#/books/%E0%A4%A/components/ultimate-b2-students-book/review?view=library",
  ];
  for (const hash of invalid) assert.deepEqual(parseHostedBuilderHash(hash), { kind: "not-found" }, hash);
  assert.throws(() => hostedBuilderReviewHash({ bookSlug: "ultimate-b2", componentSlug: "../secret", intent: { view: "library" } }), /identity is invalid/);
  assert.throws(() => hostedBuilderReviewHash({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", intent: { view: "activity", activityId: "valid-id", unitNumber: 1 } }), /incomplete/);
});

test("generic shell owns navigation while B2 imports stay inside the adapter boundary", async () => {
  const [shell, reviewPage, router, adapters, b2Workspace, entry, root] = await Promise.all([
    read("src/apps/book-builder/hosted/HostedBookBuilderApp.jsx"),
    read("src/apps/book-builder/hosted/HostedBuilderReviewPage.jsx"),
    read("src/apps/book-builder/hosted/hostedBuilderRouter.js"),
    read("src/apps/book-builder/hosted/hostedBuilderAdapters.jsx"),
    read("src/apps/ultimate-b2-builder/HostedUltimateB2BuilderApp.jsx"),
    read("src/apps/book-builder/hosted/hostedBuilderEntry.jsx"),
    read("src/apps/book-builder/hosted/HostedAuthenticatedBookBuilderApp.jsx"),
  ]);
  assert.doesNotMatch(shell, /ultimate-b2|UltimateB2|StudentsBookActivity|runtime-hotspots|TeacherOffline/i);
  assert.doesNotMatch(reviewPage, /ultimate-b2|UltimateB2|TeacherOffline|android-teacher-offline|postMessage|localStorage|sessionStorage/i);
  assert.match(reviewPage, /HostedViewerPreview/);
  assert.match(adapters, /UltimateB2StudentsBookHostedWorkspace/);
  assert.doesNotMatch(b2Workspace, /NormalizedStudentsBookActivity|ACTIVITY_MODES/);
  assert.match(b2Workspace, /HostedUltimateB2HotspotBuilder/);
  assert.match(b2Workspace, /UnifiedBuilderReview/);
  assert.doesNotMatch(b2Workspace, /TeacherOfflineLibrary|ClassroomToolsProvider|teacherBookMenuSkins|hostedReviewUiAssets|android-teacher-offline/);
  assert.match(b2Workspace, /HostedTeacherUiController/);
  assert.doesNotMatch(b2Workspace, /window\.location\.hash|history\.replaceState/);
  assert.match(router, /hashchange/);
  assert.match(entry, /HostedAuthenticatedBookBuilderApp/);
  assert.doesNotMatch(entry, /virtual:book-builder-app|Teacher|Listening|MultipleChoice|activityBuilderEntry/);
  assert.match(root, /<BuilderAuthGate>/);
  assert.match(root, /lazy\(\(\) => import\("\.\/HostedBookBuilderApp\.jsx"\)\)/);
});

test("disabled component routes render unavailable state and cannot resolve the Students Book adapter", async () => {
  const [shell, adapters] = await Promise.all([
    read("src/apps/book-builder/hosted/HostedBookBuilderApp.jsx"),
    read("src/apps/book-builder/hosted/hostedBuilderAdapters.jsx"),
  ]);
  assert.match(shell, /if \(!adapter\) return <UnavailableComponent/);
  assert.match(shell, /Authoring adapter pending/);
  assert.match(adapters, /if \(!component\?\.adapterId\) return null/);
  assert.match(adapters, /adapter\.bookSlug !== book\?\.slug/);
  assert.match(adapters, /adapter\.componentSlug !== component\.slug/);
});

test("hosted shell exposes only narrow content persistence and local authoring routes stay outside it", async () => {
  const hostedSources = await Promise.all([
    "src/apps/book-builder/hosted/HostedBookBuilderApp.jsx",
    "src/apps/book-builder/hosted/hostedBuilderCatalog.js",
    "src/apps/book-builder/hosted/hostedBuilderRouter.js",
    "src/apps/book-builder/hosted/hostedBuilderAdapters.jsx",
    "src/apps/ultimate-b2-builder/HostedUltimateB2BuilderApp.jsx",
  ].map(read));
  const source = hostedSources.join("\n");
  assert.doesNotMatch(source, /__hhplms|writeFile|FormData|repositoryFileTarget|write-capability/i);
  const local = await read("src/apps/ultimate-b2-builder/UltimateB2BuilderApp.jsx");
  assert.match(local, /__hhplms\/ultimate-b2-publisher-activities/);
});

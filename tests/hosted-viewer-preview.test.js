import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { HOSTED_VIEWER_ORIGIN, createHostedViewerPreviewUrl } from "../src/apps/book-builder/hosted/hostedViewerPreviewUrl.js";
import { isHostedViewerPreviewRequest, resolveHostedViewerPreviewIntent } from "../src/apps/android-teacher-offline/hostedViewerPreviewIntent.js";
import { createReviewComponentRegistry } from "../src/apps/android-teacher-offline/reviewComponentRegistryCore.js";

const pageUnits = [{ number: 1, pages: [{ id: "ub2-sb-unit-1-part-1", activities: [{ activityKey: "ultimate-b2-sb-u1-p1-o1" }] }] }];
const activities = [{ stableActivityId: "ultimate-b2-sb-u1-p1-o1", unitNumber: 1, printedPage: 5 }];
const productCatalog = [{ slug: "ultimate-b2", components: [
  { slug: "ultimate-b2-students-book", reviewState: "installed", title: "Students Book" },
  { slug: "ultimate-b2-workbook", reviewState: "pending", title: "Workbook" },
  { slug: "ultimate-b2-grammar-book", reviewState: "pending", title: "Grammar Book" },
] }];
const runtime = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", contentPackProvider: { load() {} }, pageUnits };
const registry = createReviewComponentRegistry(productCatalog, [runtime], { bookSlug: runtime.bookSlug, componentSlug: runtime.componentSlug });
const identity = "builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-students-book";

test("Builder creates deterministic canonical Viewer URLs from a fixed trusted origin", () => {
  assert.equal(HOSTED_VIEWER_ORIGIN, "https://hhplms-viewer.netlify.app");
  assert.equal(createHostedViewerPreviewUrl({ ...runtime, view: "library" }), "https://hhplms-viewer.netlify.app/?builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-students-book&view=library");
  assert.equal(createHostedViewerPreviewUrl({ ...runtime, view: "page", unitNumber: 1, pageId: "ub2-sb-unit-1-part-1" }), "https://hhplms-viewer.netlify.app/?builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-students-book&view=page&unitNumber=1&pageId=ub2-sb-unit-1-part-1");
  assert.equal(createHostedViewerPreviewUrl({ ...runtime, view: "activity", activityId: "ultimate-b2-sb-u1-p1-o1" }), "https://hhplms-viewer.netlify.app/?builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-students-book&view=activity&activityId=ultimate-b2-sb-u1-p1-o1");
  assert.throws(() => createHostedViewerPreviewUrl({ ...runtime, view: "activity", activityId: "javascript:alert(1)" }), /invalid/);
  assert.throws(() => createHostedViewerPreviewUrl({ ...runtime, view: "page", unitNumber: 1, pageId: "x&token=secret" }), /invalid/);
  assert.throws(() => createHostedViewerPreviewUrl({ ...runtime, view: "https://attacker.example" }), /unsupported/);
});

test("hosted Viewer resolves strict library, page, and canonical activity intents", () => {
  assert.deepEqual(resolveHostedViewerPreviewIntent({ search: `?${identity}&view=library`, hosted: true, registry }), { kind: "valid", view: "library", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", navigation: { view: "library" } });
  assert.deepEqual(resolveHostedViewerPreviewIntent({ search: `?${identity}&view=page&unitNumber=1&pageId=ub2-sb-unit-1-part-1`, hosted: true, pageUnits, registry }), { kind: "valid", view: "page", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", navigation: { view: "book", location: { unitNumber: 1, tab: "pages", pageId: "ub2-sb-unit-1-part-1" } } });
  assert.deepEqual(resolveHostedViewerPreviewIntent({ search: `?${identity}&view=activity&activityId=ultimate-b2-sb-u1-p1-o1`, hosted: true, activities, pageUnits, registry }), { kind: "valid", view: "activity", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", navigation: { view: "book", location: { unitNumber: 1, tab: "pages", pageId: "ub2-sb-unit-1-part-1" }, activityId: "ultimate-b2-sb-u1-p1-o1" } });
});

test("hosted Viewer fails closed for malformed, unknown, duplicated, extra, and oversized intents", () => {
  const invalidSearches = [`?${identity}&view=unknown`, `?${identity}&view=library&token=secret`, `?${identity}&builderPreview=1&view=library`, `?${identity}&view=page&unitNumber=1&pageId=unknown-page`, `?${identity}&view=activity&activityId=unknown-activity`, `?${identity}&view=activity&activityId=${"a".repeat(129)}`, "?builderPreview=1&bookSlug=unknown&componentSlug=unknown&view=library"];
  for (const search of invalidSearches) assert.deepEqual(resolveHostedViewerPreviewIntent({ search, hosted: true, activities, pageUnits, registry }), { kind: "invalid", message: "The requested Builder preview is invalid or unavailable." });
  assert.equal(resolveHostedViewerPreviewIntent({ search: "?builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-workbook&view=activity&activityId=ultimate-b2-sb-u1-p1-o1", hosted: true, activities, pageUnits, registry }).kind, "unavailable");
  assert.equal(resolveHostedViewerPreviewIntent({ search: "?builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-grammar-book&view=page&unitNumber=1&pageId=ub2-sb-unit-1-part-1", hosted: true, activities, pageUnits, registry }).kind, "unavailable");
});

test("non-hosted Android runtime ignores Builder preview query and intro suppression is capability gated", () => {
  const search = `?${identity}&view=library`;
  assert.deepEqual(resolveHostedViewerPreviewIntent({ search, hosted: false, activities, pageUnits, registry }), { kind: "none" });
  assert.equal(isHostedViewerPreviewRequest(search, false), false);
  assert.equal(isHostedViewerPreviewRequest(search, true), true);
});

test("canonical preview frame has no origin input, credentials, DOM bridge, or postMessage channel", async () => {
  const [frame, app, entry] = await Promise.all([readFile("src/apps/book-builder/hosted/HostedViewerPreview.jsx", "utf8"), readFile("src/apps/android-teacher-offline/TeacherOfflineApp.jsx", "utf8"), readFile("src/apps/book-builder/hosted/hostedBuilderEntry.jsx", "utf8")]);
  assert.match(frame, /referrerPolicy="no-referrer"/);
  assert.match(frame, /title=\{title\}/);
  assert.doesNotMatch(frame, /postMessage|contentWindow|document\.domain|credentials|token|session|origin\s*[},]/i);
  assert.match(app, /runInteractiveViewerStartup/);
  assert.match(app, /animationsActive && !hostedPreviewRequested/);
  assert.match(entry, /HostedAuthenticatedBookBuilderApp/);
  assert.doesNotMatch(entry, /Teacher|Listening|MultipleChoice|activityBuilderEntry|virtual:book-builder-app/);
});

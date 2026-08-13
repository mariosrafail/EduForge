import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { HOSTED_VIEWER_ORIGIN, createHostedViewerPreviewUrl } from "../src/apps/book-builder/hosted/hostedViewerPreviewUrl.js";
import { isHostedViewerPreviewRequest, resolveHostedViewerPreviewIntent } from "../src/apps/android-teacher-offline/hostedViewerPreviewIntent.js";

const pageUnits = [{ number: 1, pages: [{ id: "ub2-sb-unit-1-part-1", activities: [{ activityKey: "ultimate-b2-sb-u1-p1-o1" }] }] }];
const activities = [{ stableActivityId: "ultimate-b2-sb-u1-p1-o1", unitNumber: 1, printedPage: 5 }];

test("Builder creates deterministic canonical Viewer URLs from a fixed trusted origin", () => {
  assert.equal(HOSTED_VIEWER_ORIGIN, "https://hhplms-viewer.netlify.app");
  assert.equal(createHostedViewerPreviewUrl({ view: "library" }), "https://hhplms-viewer.netlify.app/?builderPreview=1&view=library");
  assert.equal(createHostedViewerPreviewUrl({ view: "page", unitNumber: 1, pageId: "ub2-sb-unit-1-part-1" }), "https://hhplms-viewer.netlify.app/?builderPreview=1&view=page&unitNumber=1&pageId=ub2-sb-unit-1-part-1");
  assert.equal(createHostedViewerPreviewUrl({ view: "activity", activityId: "ultimate-b2-sb-u1-p1-o1" }), "https://hhplms-viewer.netlify.app/?builderPreview=1&view=activity&activityId=ultimate-b2-sb-u1-p1-o1");
  assert.throws(() => createHostedViewerPreviewUrl({ view: "activity", activityId: "javascript:alert(1)" }), /invalid/);
  assert.throws(() => createHostedViewerPreviewUrl({ view: "page", unitNumber: 1, pageId: "x&token=secret" }), /invalid/);
  assert.throws(() => createHostedViewerPreviewUrl({ view: "https://attacker.example" }), /unsupported/);
});

test("hosted Viewer resolves strict library, page, and canonical activity intents", () => {
  assert.deepEqual(resolveHostedViewerPreviewIntent({ search: "?builderPreview=1&view=library", hosted: true }), { kind: "valid", view: "library", navigation: { view: "library" } });
  assert.deepEqual(resolveHostedViewerPreviewIntent({ search: "?builderPreview=1&view=page&unitNumber=1&pageId=ub2-sb-unit-1-part-1", hosted: true, pageUnits }), { kind: "valid", view: "page", navigation: { view: "book", location: { unitNumber: 1, tab: "pages", pageId: "ub2-sb-unit-1-part-1" } } });
  assert.deepEqual(resolveHostedViewerPreviewIntent({ search: "?builderPreview=1&view=activity&activityId=ultimate-b2-sb-u1-p1-o1", hosted: true, activities, pageUnits }), { kind: "valid", view: "activity", navigation: { view: "book", location: { unitNumber: 1, tab: "pages", pageId: "ub2-sb-unit-1-part-1" }, activityId: "ultimate-b2-sb-u1-p1-o1" } });
});

test("hosted Viewer fails closed for malformed, unknown, duplicated, extra, and oversized intents", () => {
  const invalidSearches = ["?builderPreview=0&view=library", "?builderPreview=1&view=unknown", "?builderPreview=1&view=library&token=secret", "?builderPreview=1&builderPreview=1&view=library", "?builderPreview=1&view=page&unitNumber=1&pageId=unknown-page", "?builderPreview=1&view=activity&activityId=unknown-activity", `?builderPreview=1&view=activity&activityId=${"a".repeat(129)}`];
  for (const search of invalidSearches) assert.deepEqual(resolveHostedViewerPreviewIntent({ search, hosted: true, activities, pageUnits }), { kind: "invalid", message: "The requested Builder preview is invalid or unavailable." });
});

test("non-hosted Android runtime ignores Builder preview query and intro suppression is capability gated", () => {
  const search = "?builderPreview=1&view=library";
  assert.deepEqual(resolveHostedViewerPreviewIntent({ search, hosted: false, activities, pageUnits }), { kind: "none" });
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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_HOSTED_VIEWER_BASE_URL,
  HOSTED_VIEWER_BASE_URL,
  HOSTED_VIEWER_ORIGIN,
  createHostedViewerPreviewUrl,
  normalizeHostedViewerBaseUrl,
} from "../src/apps/book-builder/hosted/hostedViewerPreviewUrl.js";
import { isHostedViewerPreviewRequest, resolveHostedViewerPreviewIntent } from "../src/apps/android-teacher-offline/hostedViewerPreviewIntent.js";
import { HOSTED_VIEWER_RUNTIME_MODES, resolveHostedViewerRuntimeContext } from "../src/apps/android-teacher-offline/hostedReleasePreview.js";
import { getOfflineTeacherSolution } from "../src/apps/android-teacher-offline/hostedAuthorizedTeacherSolutions.js";
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
const previewAuthorization = `v1.${Buffer.from("scope").toString("base64url")}.${"a".repeat(43)}`;
const identity = `builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-students-book&previewAuthorization=${previewAuthorization}`;

test("Builder creates deterministic canonical Viewer URLs from a fixed trusted origin", () => {
  assert.equal(DEFAULT_HOSTED_VIEWER_BASE_URL, "https://hhplms-viewer.netlify.app/");
  assert.equal(HOSTED_VIEWER_BASE_URL, "https://hhplms-viewer.netlify.app/");
  assert.equal(HOSTED_VIEWER_ORIGIN, "https://hhplms-viewer.netlify.app");
  const library = new URL(createHostedViewerPreviewUrl({ ...runtime, view: "library", previewAuthorization }));
  const page = new URL(createHostedViewerPreviewUrl({ ...runtime, view: "page", unitNumber: 1, pageId: "ub2-sb-unit-1-part-1", previewAuthorization }));
  const activity = new URL(createHostedViewerPreviewUrl({ ...runtime, view: "activity", activityId: "ultimate-b2-sb-u1-p1-o1", previewAuthorization }));
  const nativeActivity = new URL(createHostedViewerPreviewUrl({ ...runtime, view: "activity", activityId: "ultimate-b2-sb-u1-p1-o90", unitNumber: 1, pageId: "ub2-sb-unit-1-part-1", previewAuthorization }));
  assert.deepEqual(Object.fromEntries(library.searchParams), { builderPreview: "1", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", previewAuthorization, view: "library" });
  assert.equal(page.searchParams.get("pageId"), "ub2-sb-unit-1-part-1");
  assert.equal(activity.searchParams.get("activityId"), "ultimate-b2-sb-u1-p1-o1");
  assert.equal(nativeActivity.searchParams.get("pageId"), "ub2-sb-unit-1-part-1");
  assert.throws(() => createHostedViewerPreviewUrl({ ...runtime, view: "library" }), /authorization is required/);
  assert.throws(() => createHostedViewerPreviewUrl({ ...runtime, view: "activity", activityId: "javascript:alert(1)", previewAuthorization }), /invalid/);
  assert.throws(() => createHostedViewerPreviewUrl({ ...runtime, view: "page", unitNumber: 1, pageId: "x&token=secret", previewAuthorization }), /invalid/);
  assert.throws(() => createHostedViewerPreviewUrl({ ...runtime, view: "https://attacker.example", previewAuthorization }), /unsupported/);
  const cloudflare = new URL(createHostedViewerPreviewUrl(
    { ...runtime, view: "library", previewAuthorization },
    { baseUrl: "https://builder.hhplms.workers.dev/player/" },
  ));
  assert.equal(cloudflare.origin, "https://builder.hhplms.workers.dev");
  assert.equal(cloudflare.pathname, "/player/");
  assert.equal(normalizeHostedViewerBaseUrl("https://builder.hhplms.workers.dev/player"), "https://builder.hhplms.workers.dev/player/");
  for (const unsafe of ["http://builder.hhplms.workers.dev/player/", "https://user@example.com/player/", "https://example.com/player/?secret=x", "javascript:alert(1)"]) {
    assert.throws(() => normalizeHostedViewerBaseUrl(unsafe), /invalid/);
  }
});

test("hosted Viewer resolves strict library, page, and canonical activity intents", () => {
  assert.deepEqual(resolveHostedViewerPreviewIntent({ search: `?${identity}&view=library`, hosted: true, registry }), { kind: "valid", view: "library", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", navigation: { view: "library" } });
  assert.deepEqual(resolveHostedViewerPreviewIntent({ search: `?${identity}&view=page&unitNumber=1&pageId=ub2-sb-unit-1-part-1`, hosted: true, pageUnits, registry }), { kind: "valid", view: "page", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", navigation: { view: "book", location: { unitNumber: 1, tab: "pages", pageId: "ub2-sb-unit-1-part-1" } } });
  assert.deepEqual(resolveHostedViewerPreviewIntent({ search: `?${identity}&view=activity&activityId=ultimate-b2-sb-u1-p1-o1`, hosted: true, activities, pageUnits, registry }), { kind: "valid", view: "activity", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", navigation: { view: "book", location: { unitNumber: 1, tab: "pages", pageId: "ub2-sb-unit-1-part-1" }, activityId: "ultimate-b2-sb-u1-p1-o1" } });
  assert.deepEqual(resolveHostedViewerPreviewIntent({ search: `?${identity}&view=activity&activityId=ultimate-b2-sb-u1-p1-o90&unitNumber=1&pageId=ub2-sb-unit-1-part-1`, hosted: true, activities, pageUnits, registry }), { kind: "valid", view: "activity", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", navigation: { view: "book", location: { unitNumber: 1, tab: "pages", pageId: "ub2-sb-unit-1-part-1" }, activityId: "ultimate-b2-sb-u1-p1-o90" } });
});

test("release preview requires one strict UUID and remains a read-only pinned intent", () => {
  const releaseId = "10000000-0000-4000-8000-000000000099";
  const intent = resolveHostedViewerPreviewIntent({ search: `?${identity}&releaseId=${releaseId}&view=activity&activityId=ultimate-b2-sb-u1-p1-o1`, hosted: true, activities, pageUnits, registry });
  assert.equal(intent.kind, "valid");
  assert.equal(intent.releaseId, releaseId);
  assert.match(createHostedViewerPreviewUrl({ ...runtime, view: "library", releaseId, previewAuthorization }), /releaseId=10000000-0000-4000-8000-000000000099/);
  for (const value of ["latest", "../draft", `${releaseId}&releaseId=${releaseId}`]) assert.equal(resolveHostedViewerPreviewIntent({ search: `?${identity}&releaseId=${value}&view=library`, hosted: true, registry }).kind, "invalid");
});

test("hosted Viewer runtime separates bare, authorized draft, exact release, and invalid contexts", () => {
  const releaseId = "10000000-0000-4000-8000-000000000099";
  assert.deepEqual(resolveHostedViewerRuntimeContext(""), { kind: HOSTED_VIEWER_RUNTIME_MODES.BARE, teacherPreview: false });
  assert.deepEqual(resolveHostedViewerRuntimeContext(`?${identity}&view=library`), { kind: HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW, teacherPreview: true, authorization: previewAuthorization });
  assert.deepEqual(resolveHostedViewerRuntimeContext(`?${identity}&releaseId=${releaseId}&view=library`), { kind: HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW, teacherPreview: true, authorization: previewAuthorization, releaseId });
  for (const search of ["?builderPreview=1", `?builderPreview=1&previewAuthorization=malformed`, `?previewAuthorization=${previewAuthorization}`, `?${identity}&releaseId=latest&view=library`]) {
    assert.deepEqual(resolveHostedViewerRuntimeContext(search), { kind: HOSTED_VIEWER_RUNTIME_MODES.INVALID, teacherPreview: false });
  }
});

test("Viewer Teacher solutions are unavailable anonymously and fetched only for an authorized exact release", async () => {
  const releaseId = "10000000-0000-4000-8000-000000000099";
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  const calls = [];
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (url, options) => {
    calls.push([url, options]);
    return { ok: true, status: 200, json: async () => ({ releaseId, activityId: "ultimate-b2-sb-u1-p1-o1", document: { solutionAvailability: "available" } }) };
  } });
  try {
    for (const search of ["", "?builderPreview=1&previewAuthorization=malformed", `?${identity}&view=activity&activityId=ultimate-b2-sb-u1-p1-o1`]) {
      Object.defineProperty(globalThis, "location", { configurable: true, value: new URL(`https://hhplms-viewer.netlify.app/${search}`) });
      assert.equal(await getOfflineTeacherSolution("ultimate-b2-sb-u1-p1-o1"), null);
    }
    assert.deepEqual(calls, []);
    Object.defineProperty(globalThis, "location", { configurable: true, value: new URL(`https://hhplms-viewer.netlify.app/?${identity}&releaseId=${releaseId}&view=activity&activityId=ultimate-b2-sb-u1-p1-o1`) });
    assert.deepEqual(await getOfflineTeacherSolution("ultimate-b2-sb-u1-p1-o1"), { solutionAvailability: "available" });
    assert.match(calls[0][0], new RegExp(`/preview/releases/.*/${releaseId}/teacher-solution/ultimate-b2-sb-u1-p1-o1\\?previewAuthorization=`));
    assert.deepEqual(calls[0][1], { method: "GET", credentials: "omit", cache: "no-store" });
  } finally {
    if (locationDescriptor) Object.defineProperty(globalThis, "location", locationDescriptor); else delete globalThis.location;
    if (fetchDescriptor) Object.defineProperty(globalThis, "fetch", fetchDescriptor); else delete globalThis.fetch;
  }
});

test("hosted Viewer fails closed for malformed, unknown, duplicated, extra, and oversized intents", () => {
  const invalidSearches = [`?${identity}&view=unknown`, `?${identity}&view=library&token=secret`, `?${identity}&builderPreview=1&view=library`, `?${identity}&view=page&unitNumber=1&pageId=unknown-page`, `?${identity}&view=activity&activityId=unknown-activity`, `?${identity}&view=activity&activityId=unknown-activity&unitNumber=1`, `?${identity}&view=activity&activityId=unknown-activity&unitNumber=1&pageId=unknown-page`, `?${identity}&view=activity&activityId=${"a".repeat(129)}`, "?builderPreview=1&bookSlug=unknown&componentSlug=unknown&view=library"];
  for (const search of invalidSearches) assert.deepEqual(resolveHostedViewerPreviewIntent({ search, hosted: true, activities, pageUnits, registry }), { kind: "invalid", message: "The requested Builder preview is invalid or unavailable." });
  assert.equal(resolveHostedViewerPreviewIntent({ search: `?builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-workbook&previewAuthorization=${previewAuthorization}&view=activity&activityId=ultimate-b2-sb-u1-p1-o1`, hosted: true, activities, pageUnits, registry }).kind, "unavailable");
  assert.equal(resolveHostedViewerPreviewIntent({ search: `?builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-grammar-book&previewAuthorization=${previewAuthorization}&view=page&unitNumber=1&pageId=ub2-sb-unit-1-part-1`, hosted: true, activities, pageUnits, registry }).kind, "unavailable");
});

test("non-hosted Android runtime ignores Builder preview query and intro suppression is capability gated", () => {
  const search = `?${identity}&view=library`;
  assert.deepEqual(resolveHostedViewerPreviewIntent({ search, hosted: false, activities, pageUnits, registry }), { kind: "none" });
  assert.equal(isHostedViewerPreviewRequest(search, false), false);
  assert.equal(isHostedViewerPreviewRequest(search, true), true);
});

test("canonical preview frame permits only the versioned Viewer fullscreen-exit presentation signal", async () => {
  const [frame, standalone, dialog, styles, router, authorizationClient, app, entry, protocol] = await Promise.all([readFile("src/apps/book-builder/hosted/HostedViewerPreview.jsx", "utf8"), readFile("src/apps/book-builder/hosted/HostedBuilderReviewPage.jsx", "utf8"), readFile("src/apps/ultimate-b2-builder/UnifiedBuilderReview.jsx", "utf8"), readFile("src/apps/book-builder/hosted/hostedBuilder.css", "utf8"), readFile("src/apps/book-builder/hosted/hostedBuilderRouter.js", "utf8"), readFile("src/apps/book-builder/hosted/builderPreviewAuthorizationApi.js", "utf8"), readFile("src/apps/android-teacher-offline/TeacherOfflineApp.jsx", "utf8"), readFile("src/apps/book-builder/hosted/hostedBuilderEntry.jsx", "utf8"), readFile("src/shared/viewerPresentationProtocol.js", "utf8")]);
  assert.match(frame, /referrerPolicy="no-referrer"/);
  assert.match(frame, /title=\{title\}/);
  assert.match(frame, /createBuilderPreviewAuthorization/);
  assert.match(authorizationClient, /credentials: "same-origin"/);
  assert.match(authorizationClient, /\/builder\/api\/preview-authorization/);
  assert.match(frame, /openPlayerHref/);
  assert.match(frame, /target="_blank" rel="noopener noreferrer">Open Player/);
  assert.doesNotMatch(frame, /href=\{src\}/);
  assert.match(standalone, /<HostedViewerPreview/);
  assert.match(standalone, /allowFullscreen=\{true\}/);
  assert.doesNotMatch(dialog, /allowFullscreen/);
  assert.match(frame, /allowFullscreen = false/);
  assert.match(frame, /iframeElement\.requestFullscreen\(\)/);
  assert.match(frame, /document\.exitFullscreen\(\)/);
  assert.match(frame, /document\.addEventListener\("fullscreenchange"/);
  assert.match(frame, /document\.fullscreenElement === iframeElement/);
  assert.match(frame, /isFullscreen \? "Exit Fullscreen" : "Fullscreen"/);
  assert.match(frame, /catch \{\s*setFullscreenError\(true\);/);
  assert.doesNotMatch(frame, /alert\(/);
  assert.doesNotMatch(frame, /webkitRequestFullscreen|webkitExitFullscreen|mozRequestFullScreen|msRequestFullscreen/);
  assert.doesNotMatch(styles, /\.hosted-viewer-preview:fullscreen/);
  assert.match(styles, /\.hosted-viewer-preview iframe:fullscreen \{[^}]*width: 100%;[^}]*height: 100%;[^}]*min-height: 0;[^}]*border: 0;/);
  assert.doesNotMatch(`${standalone}\n${router}`, /previewAuthorization/);
  assert.match(protocol, /^export const VIEWER_EXIT_FULLSCREEN_MESSAGE = "HHPLMS_VIEWER_EXIT_FULLSCREEN_V1";\s*$/);
  assert.doesNotMatch(protocol, /previewAuthorization|token|session|book|component|activity|release|teacher|user|content|database/i);
  assert.match(app, /Capacitor\.isNativePlatform\(\)[\s\S]*App\.minimizeApp\(\)[\s\S]*return;/);
  assert.match(app, /hosted && globalThis\.parent && globalThis\.parent !== globalThis/);
  assert.match(app, /globalThis\.parent\.postMessage\(VIEWER_EXIT_FULLSCREEN_MESSAGE, "\*"\)/);
  assert.equal((app.match(/\.postMessage\(/g) || []).length, 1);
  assert.match(frame, /window\.addEventListener\("message", exitViewerFullscreen\)/);
  assert.match(frame, /event\.data !== VIEWER_EXIT_FULLSCREEN_MESSAGE/);
  assert.match(frame, /event\.origin !== HOSTED_VIEWER_ORIGIN/);
  assert.match(frame, /event\.source !== iframeElement\.contentWindow/);
  assert.match(frame, /document\.fullscreenElement !== iframeElement/);
  assert.doesNotMatch(frame, /\.postMessage\(/);
  assert.equal((frame.match(/contentWindow/g) || []).length, 1);
  assert.doesNotMatch(frame, /contentWindow\.(?:document|location|localStorage|sessionStorage)|document\.domain|document\.cookie/i);
  assert.doesNotMatch(`${frame}\n${standalone}\n${router}\n${protocol}`, /localStorage|sessionStorage|document\.cookie/i);
  assert.match(app, /runInteractiveViewerStartup/);
  assert.match(app, /animationsActive && !hostedPreviewRequested/);
  assert.match(entry, /HostedAuthenticatedBookBuilderApp/);
  assert.doesNotMatch(entry, /Teacher|Listening|MultipleChoice|activityBuilderEntry|virtual:book-builder-app/);
});

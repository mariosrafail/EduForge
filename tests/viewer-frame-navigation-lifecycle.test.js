import assert from "node:assert/strict";
import test from "node:test";

import {
  createViewerFrameNavigationLifecycle,
  viewerFrameNavigationIdentity,
} from "../scripts/book-builder/viewer-frame-navigation-lifecycle.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, reject, resolve };
}

function locator(handle) {
  return { elementHandle: () => Promise.resolve(handle) };
}

function handle(name, clicks) {
  return { click: async () => { clicks.push(name); }, dispose: async () => {} };
}

test("a superseded persistent Viewer frame navigation cannot click or fail after the current navigation", async () => {
  const frame = {};
  const staleLibrary = deferred();
  const clicks = [];
  const failures = [];
  const contexts = [];
  const lifecycle = createViewerFrameNavigationLifecycle({
    run: async (_frame, navigation) => {
      const url = new URL(navigation.identity);
      contexts.push({ frame: navigation.frame, token: url.searchParams.get("previewAuthorization"), componentSlug: url.searchParams.get("componentSlug") });
      if (url.searchParams.get("previewAuthorization") === "authorization-a") await navigation.wait(staleLibrary.promise);
      await navigation.click(locator(handle(`${url.searchParams.get("previewAuthorization")}:unit`, clicks)), "Open Unit 1");
      await navigation.click(locator(handle(`${url.searchParams.get("previewAuthorization")}:page`, clicks)), "Student Unit 1 page card");
    },
    onError: (error) => failures.push(error),
  });
  const base = "https://hhplms-viewer.netlify.app/?builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-students-book&view=library";
  const navigationA = lifecycle.begin(frame, viewerFrameNavigationIdentity(`${base}&previewAuthorization=authorization-a#library`));
  await Promise.resolve();
  const internalNavigation = lifecycle.begin(frame, viewerFrameNavigationIdentity(`${base}&previewAuthorization=authorization-a#book`));
  assert.equal(internalNavigation, navigationA, "Viewer-internal hash state remains part of the same iframe source generation");
  const navigationB = lifecycle.begin(frame, viewerFrameNavigationIdentity(`${base}&previewAuthorization=authorization-b#library`));

  assert.deepEqual(await navigationA.completion, { status: "superseded" });
  assert.deepEqual(await navigationB.completion, { status: "completed" });
  staleLibrary.reject(new Error("obsolete page-card timeout"));
  await Promise.resolve();

  assert.deepEqual(clicks, ["authorization-b:unit", "authorization-b:page"]);
  assert.deepEqual(failures, []);
  assert.equal(contexts.length, 2);
  assert.equal(new Set(contexts.map((context) => context.frame)).size, 1, "the same persistent iframe/frame serves both generations");
  assert.ok(contexts.every((context) => context.componentSlug === "ultimate-b2-students-book"), "both authorizations remain component-scoped");
  assert.equal(lifecycle.current(frame), navigationB);
});

test("a missing page card in the current Viewer navigation still fails", async () => {
  const frame = {};
  const missing = new Error("Student Unit 1 page card is missing from the current Viewer navigation.");
  const failures = [];
  const lifecycle = createViewerFrameNavigationLifecycle({
    run: async (_frame, navigation) => navigation.click(locator(null), "Student Unit 1 page card"),
    onError: (error) => failures.push(error),
  });

  const navigation = lifecycle.begin(frame, "https://hhplms-viewer.netlify.app/?componentSlug=ultimate-b2-students-book&view=library");
  const result = await navigation.completion;
  assert.equal(result.status, "failed");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].message, missing.message);
});

test("a locator timeout on the current Viewer URL still fails", async () => {
  const frame = {};
  const timeout = Object.assign(new Error("locator.click: Timeout 45000ms exceeded."), { name: "TimeoutError" });
  const failures = [];
  const lifecycle = createViewerFrameNavigationLifecycle({
    run: async (_frame, navigation) => navigation.click({ elementHandle: () => Promise.reject(timeout) }, "Student Unit 1 page card"),
    onError: (error) => failures.push(error),
  });

  const navigation = lifecycle.begin(frame, "https://hhplms-viewer.netlify.app/?componentSlug=ultimate-b2-students-book&view=library");
  const result = await navigation.completion;
  assert.equal(result.status, "failed");
  assert.equal(failures.length, 1);
  assert.equal(failures[0], timeout);
});

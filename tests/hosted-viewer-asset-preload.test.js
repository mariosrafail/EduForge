import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildHostedViewerAssetLoadPlan,
  createAssetProgress,
  createBinaryAssetCacheIdentity,
  createHostedStartupAssets,
  preloadAssetGroup,
  runInteractiveViewerStartup,
} from "../src/apps/android-teacher-offline/interactiveStartupAssets.js";

function manifestAsset(logicalKey, type, sizeBytes, sha256 = "a".repeat(64)) {
  return { logicalKey, bundleKey: logicalKey, type, required: true, sizeBytes, sha256 };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("hosted load plan makes pages, UI graphics and audio blocking while videos stay background-only", () => {
  const sharedPageUrl = "/assets/page-abc123.png";
  const plan = buildHostedViewerAssetLoadPlan({
    manifestAssets: [
      manifestAsset("page", "page", 100),
      manifestAsset("audio", "audio", 200),
      manifestAsset("video", "video", 300),
    ],
    pageAssetUrls: { page: sharedPageUrl },
    mediaAssetUrls: {
      audio: { localUrl: "/assets/audio-def456.mp3" },
      video: { localUrl: "/assets/video-ghi789.mp4" },
    },
    uiAssetUrls: [sharedPageUrl, "/assets/button-jkl012.png", "/assets/click-mno345.wav"],
  });

  assert.deepEqual(plan.blocking.map(({ kind }) => kind), ["image", "audio", "image", "audio"]);
  assert.deepEqual(plan.background.map(({ kind }) => kind), ["video"]);
  assert.equal(plan.blocking.filter(({ url }) => url === sharedPageUrl).length, 1);
  assert.equal(new Set([...plan.blocking, ...plan.background].map(({ url }) => url)).size, 5);
});

test("required manifest assets fail planning when the renderer has no matching runtime URL", () => {
  assert.throws(
    () => buildHostedViewerAssetLoadPlan({ manifestAssets: [manifestAsset("missing", "audio", 10)] }),
    (error) => error.code === "VIEWER_ASSET_PLAN_INVALID" && /runtime URL/.test(error.message),
  );
});

test("blocking progress is deterministic, byte-weighted with count fallback, monotonic and exactly complete", () => {
  const assets = [
    { key: "small", url: "/small.png", sizeBytes: 10 },
    { key: "ui", url: "/ui.png", sizeBytes: null },
    { key: "large", url: "/large.mp3", sizeBytes: 30 },
  ];
  const progress = createAssetProgress(assets);
  assert.deepEqual(progress.snapshot(), { completedAssets: 0, totalAssets: 3, percentage: 0 });
  assert.deepEqual(progress.complete(assets[0]), { completedAssets: 1, totalAssets: 3, percentage: 16 });
  assert.deepEqual(progress.complete(assets[0]), { completedAssets: 1, totalAssets: 3, percentage: 16 });
  assert.deepEqual(progress.complete(assets[1]), { completedAssets: 2, totalAssets: 3, percentage: 50 });
  assert.deepEqual(progress.complete(assets[2]), { completedAssets: 3, totalAssets: 3, percentage: 100 });

  const blockingOnly = createAssetProgress(assets.slice(0, 2));
  blockingOnly.complete(assets[0]);
  assert.ok(blockingOnly.snapshot().percentage < 100);
  assert.equal(blockingOnly.complete(assets[1]).percentage, 100, "background video work is not part of startup progress");
});

test("Viewer startup cannot become ready before critical preload completes and starts video work afterward", async () => {
  const gate = deferred();
  const states = [];
  let backgroundStarted = false;
  const startupAssets = {
    createLoadPlan: () => ({ blocking: [{ url: "/page.png" }], background: [{ url: "/video.mp4" }] }),
    preloadBlocking: async (_plan, { onProgress }) => {
      onProgress({ completedAssets: 0, totalAssets: 1, percentage: 0 });
      await gate.promise;
      onProgress({ completedAssets: 1, totalAssets: 1, percentage: 100 });
    },
    preloadBackground: async () => { backgroundStarted = true; },
  };
  const startup = runInteractiveViewerStartup({
    loadContentPack: async () => ({ assetsManifest: { assets: [] } }),
    prepareHotspots: async () => ({ revision: 4 }),
    startupAssets,
    onState: (state) => states.push(state.status),
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(states.includes("ready"), false);
  assert.equal(backgroundStarted, false);
  gate.resolve();
  const result = await startup;
  assert.equal(states.at(-1), "ready");
  await result.backgroundPromise;
  assert.equal(backgroundStarted, true);
});

test("background video failures are nonfatal after ready", async () => {
  const loader = createHostedStartupAssets({}, {
    loadAsset: async (asset) => {
      if (asset.kind === "video") throw new Error("video unavailable");
    },
  });
  const plan = {
    blocking: [{ key: "page", url: "/page.png", kind: "image", sizeBytes: 1 }],
    background: [{ key: "video", url: "/video.mp4", kind: "video", sizeBytes: 100 }],
  };
  await loader.preloadBlocking(plan);
  const result = await loader.preloadBackground(plan);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].asset.key, "video");
});

test("blocking failure stays non-ready and a clean retry can reach ready", async () => {
  let attempts = 0;
  const states = [];
  const startupAssets = {
    createLoadPlan: () => ({ blocking: [{ url: "/page.png" }], background: [] }),
    preloadBlocking: async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("page failed");
        error.code = "VIEWER_ASSET_LOAD_FAILED";
        throw error;
      }
    },
    preloadBackground: async () => {},
  };
  const run = () => runInteractiveViewerStartup({
    loadContentPack: async () => ({ assetsManifest: { assets: [] } }),
    prepareHotspots: async () => ({ revision: attempts }),
    startupAssets,
    onState: (state) => states.push(state.status),
  });

  await assert.rejects(run(), /page failed/);
  assert.equal(states.at(-1), "error");
  assert.equal(states.includes("ready"), false);
  const retried = await run();
  assert.equal(states.at(-1), "ready");
  await retried.backgroundPromise;
  assert.equal(attempts, 2);
});

test("cancellation stops bounded workers and prevents stale completion progress", async () => {
  const controller = new AbortController();
  const progress = [];
  const started = deferred();
  const result = preloadAssetGroup(
    [{ key: "one", url: "/one.png" }, { key: "two", url: "/two.png" }],
    {
      concurrency: 1,
      signal: controller.signal,
      onProgress: (value) => progress.push(value),
      loadAsset: async (_asset, { signal }) => {
        started.resolve();
        await new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
    },
  );
  await started.promise;
  controller.abort(new Error("navigation changed"));
  await assert.rejects(result, /navigation changed/);
  assert.deepEqual(progress, [{ completedAssets: 0, totalAssets: 2, percentage: 0 }]);
});

test("binary cache identity changes with binary fingerprints and ignores hotspot-only revisions", () => {
  const binary = { url: "/assets/page-abc123.png", sha256: "1".repeat(64) };
  const revisionOne = createBinaryAssetCacheIdentity({ ...binary, hotspotRevision: 10 });
  const revisionTwo = createBinaryAssetCacheIdentity({ ...binary, hotspotRevision: 11 });
  assert.equal(revisionOne, revisionTwo);
  assert.notEqual(revisionOne, createBinaryAssetCacheIdentity({ ...binary, sha256: "2".repeat(64) }));
  assert.notEqual(revisionOne, createBinaryAssetCacheIdentity({ ...binary, url: "/assets/page-new456.png" }));
});

test("hosted inventory uses exact renderer URLs, immutable headers stay fingerprint-scoped, and Android remains local", async () => {
  const [hosted, startupUi, generatedProvider, networkGuard, netlify] = await Promise.all([
    readFile("src/apps/android-teacher-offline/hostedReviewStartupAssets.js", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherViewerStartupStatus.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/generatedPackProvider.js", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherOfflineNetworkGuard.js", "utf8"),
    readFile("netlify-sites/viewer/netlify.toml", "utf8"),
  ]);
  assert.match(hosted, /resolveUltimateB2AuthoredAssetUrl\(page\.image\)/);
  assert.match(hosted, /ultimateB2StudentsBookMedia/);
  assert.match(hosted, /collectRuntimeAssetUrls\(legacyClassroomAssets\)/);
  assert.match(hosted, /ultimateB2Unit1Part2LegacyAudio/);
  assert.match(hosted, /pack\?\.activities\?\.activities/);
  assert.match(hosted, /getUltimateB2OpenResponseArtworkLayers/);
  assert.match(hosted, /getUltimateB2ImageActivity/);
  assert.doesNotMatch(hosted, /preview|revision|updated_at/i);
  assert.match(netlify, /for = "\/assets\/\*"[\s\S]*max-age=31536000, immutable/);
  assert.doesNotMatch(netlify, /for = "\/\*"[\s\S]*immutable/);
  assert.match(startupUi, /role="progressbar"/);
  assert.match(startupUi, /aria-valuemin="0"[\s\S]*aria-valuemax="100"[\s\S]*aria-valuenow=\{percentage\}/);
  assert.match(startupUi, /role="status"[\s\S]*aria-live="polite"/);
  assert.match(startupUi, /<button type="button"[\s\S]*>Retry<\/button>/);
  assert.match(generatedProvider, /createNoopStartupAssets/);
  assert.doesNotMatch(generatedProvider, /hostedReviewStartupAssets/);
  assert.match(networkGuard, /blockedPathPattern/);
  assert.match(networkGuard, /url\.origin === globalThis\.location\?\.origin/);
});

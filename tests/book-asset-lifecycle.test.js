import test from "node:test";
import assert from "node:assert/strict";
import { BookAssetUrlLifecycle, getBookAssetRefreshDelay } from "../src/services/bookAssetLifecycle.js";

function flush() { return new Promise((resolve) => setImmediate(resolve)); }

test("protected asset URLs refresh shortly before expiry without a tight loop", async () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  const timers = [];
  const updates = [];
  let requests = 0;
  const lifecycle = new BookAssetUrlLifecycle({
    now: () => now,
    setTimer: (callback, delay) => { timers.push({ callback, delay, cancelled: false }); return timers.length - 1; },
    clearTimer: (id) => { if (timers[id]) timers[id].cancelled = true; },
    request: async () => ({ url: `https://signed.invalid/${++requests}`, expiresAt: new Date(now + 120_000).toISOString() }),
    onUpdate: (payload, context) => updates.push({ payload, context }),
  });
  await lifecycle.start();
  assert.equal(updates[0].context.reason, "initial");
  assert.equal(timers[0].delay, 90_000);
  timers[0].callback();
  await flush();
  assert.equal(requests, 2);
  assert.equal(updates[1].context.reason, "scheduled");
  assert.equal(timers.length, 2);
  lifecycle.stop();
});

test("public URLs never schedule refresh", async () => {
  let scheduled = 0;
  const lifecycle = new BookAssetUrlLifecycle({
    request: async () => ({ url: "https://public.invalid/cover.webp", expiresAt: null }),
    setTimer: () => { scheduled += 1; return scheduled; },
  });
  await lifecycle.start();
  assert.equal(scheduled, 0);
  lifecycle.stop();
});

test("stopping a lifecycle cancels its pending refresh request", async () => {
  let aborted = false;
  let errors = 0;
  const lifecycle = new BookAssetUrlLifecycle({
    request: ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    }),
    onError: () => { errors += 1; },
  });
  const pending = lifecycle.start();
  await flush();
  lifecycle.stop();
  await pending;
  assert.equal(aborted, true);
  assert.equal(errors, 0);
});

test("failed scheduled refresh preserves control for an explicit retry", async () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  const timers = [];
  const errors = [];
  const updates = [];
  let requestNumber = 0;
  const lifecycle = new BookAssetUrlLifecycle({
    now: () => now,
    setTimer: (callback, delay) => { timers.push({ callback, delay }); return timers.length - 1; },
    clearTimer: () => {},
    request: async () => {
      requestNumber += 1;
      if (requestNumber === 2) throw new Error("temporary refresh failure");
      return { url: `https://signed.invalid/${requestNumber}`, expiresAt: new Date(now + 120_000).toISOString() };
    },
    onUpdate: (payload) => updates.push(payload),
    onError: (error) => errors.push(error),
  });
  await lifecycle.start();
  timers[0].callback();
  await flush();
  assert.equal(errors.length, 1);
  assert.equal(updates.at(-1).url, "https://signed.invalid/1");
  await lifecycle.refresh("expired");
  assert.equal(updates.at(-1).url, "https://signed.invalid/3");
  lifecycle.stop();
});

test("expired or malformed expiry values do not create refresh loops", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  assert.equal(getBookAssetRefreshDelay(null, { now }), null);
  assert.equal(getBookAssetRefreshDelay("invalid", { now }), null);
  assert.equal(getBookAssetRefreshDelay(new Date(now - 1).toISOString(), { now }), null);
});

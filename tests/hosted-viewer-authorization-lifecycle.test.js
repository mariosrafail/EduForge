import assert from "node:assert/strict";
import test from "node:test";

import {
  HOSTED_VIEWER_AUTHORIZATION_RENEWAL_MARGIN_MS,
  previewAuthorizationRenewalDelay,
  startHostedViewerAuthorizationLifecycle,
} from "../src/apps/book-builder/hosted/hostedViewerAuthorizationLifecycle.js";

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const token = (value) => `v1.${Buffer.from(`scope-${value}`).toString("base64url")}.${String(value).slice(-1).repeat(43)}`;

function timerHarness() {
  const timers = [];
  return {
    timers,
    setTimer(callback, delay) { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer; },
    clearTimer(timer) { timer.cleared = true; },
  };
}

test("authorization renewal delay is derived from server expiresAt with one deterministic margin", () => {
  const now = Date.parse("2026-08-15T16:00:00Z");
  assert.equal(HOSTED_VIEWER_AUTHORIZATION_RENEWAL_MARGIN_MS, 30_000);
  assert.equal(previewAuthorizationRenewalDelay(new Date(now + 300_000).toISOString(), now), 270_000);
  for (const expiresAt of ["invalid", new Date(now + 30_000).toISOString(), new Date(now - 1).toISOString()]) {
    assert.throws(() => previewAuthorizationRenewalDelay(expiresAt, now), /expiry/i);
  }
});

test("one scheduled renewal produces one replacement authorization without a refresh loop", async () => {
  const clock = { value: Date.parse("2026-08-15T16:00:00Z") };
  const timer = timerHarness();
  const authorizations = [];
  let requests = 0;
  const dispose = startHostedViewerAuthorizationLifecycle({
    requestAuthorization: async () => ({ token: token(++requests), expiresAt: new Date(clock.value + 300_000).toISOString() }),
    onAuthorization: (token) => authorizations.push(token),
    onError() { assert.fail("renewal should not fail"); },
    now: () => clock.value,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });
  await flush();
  assert.deepEqual(authorizations, [token(1)]);
  assert.equal(timer.timers.length, 1);
  assert.equal(timer.timers[0].delay, 270_000);
  clock.value += timer.timers[0].delay;
  timer.timers[0].callback();
  await flush();
  assert.deepEqual(authorizations, [token(1), token(2)]);
  assert.equal(requests, 2);
  assert.equal(timer.timers.length, 2);
  dispose();
  assert.equal(timer.timers[1].cleared, true);
});

test("failed renewal clears authorization and fails the explicit preview closed", async () => {
  const now = Date.parse("2026-08-15T16:00:00Z");
  const timer = timerHarness();
  const authorizations = [];
  let errors = 0;
  let requests = 0;
  startHostedViewerAuthorizationLifecycle({
    requestAuthorization: async () => {
      requests += 1;
      if (requests > 1) throw new Error("renewal unavailable");
      return { token: token(1), expiresAt: new Date(now + 300_000).toISOString() };
    },
    onAuthorization: (token) => authorizations.push(token),
    onError: () => { errors += 1; },
    now: () => now,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });
  await flush();
  timer.timers[0].callback();
  await flush();
  assert.deepEqual(authorizations, [token(1), null]);
  assert.equal(errors, 1);
  assert.equal(timer.timers.length, 1);
});

test("dispose aborts superseded authorization and prevents later state updates", async () => {
  let resolveRequest;
  let requestSignal;
  const authorizations = [];
  const dispose = startHostedViewerAuthorizationLifecycle({
    requestAuthorization: ({ signal }) => { requestSignal = signal; return new Promise((resolve) => { resolveRequest = resolve; }); },
    onAuthorization: (token) => authorizations.push(token),
    onError() { assert.fail("disposed work must not report an error"); },
  });
  assert.equal(requestSignal.aborted, false);
  dispose();
  assert.equal(requestSignal.aborted, true);
  resolveRequest({ token: token(9), expiresAt: new Date(Date.now() + 300_000).toISOString() });
  await flush();
  assert.deepEqual(authorizations, []);
});

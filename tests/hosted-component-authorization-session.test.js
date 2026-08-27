import assert from "node:assert/strict";
import test from "node:test";

import {
  createHostedPreviewComponentAuthorizationSession,
  HOSTED_COMPONENT_AUTHORIZATION_MAX_TIMER_MS,
  HOSTED_COMPONENT_AUTHORIZATION_RENEWAL_MARGIN_MS,
} from "../src/apps/android-teacher-offline/hostedPreviewComponentAuthorizationSession.js";
import { HOSTED_VIEWER_RUNTIME_MODES } from "../src/apps/android-teacher-offline/hostedReleasePreview.js";

const identities = Object.freeze({
  students: Object.freeze({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" }),
  workbook: Object.freeze({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook" }),
  grammar: Object.freeze({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-grammar-book" }),
});
const token = (value) => `v2.${Buffer.from(`component-${value}`).toString("base64url")}.${String(value).slice(-1).repeat(43)}`;

function timerHarness() {
  const timers = [];
  return {
    timers,
    setTimer(callback, delay) { const entry = { callback, delay, cleared: false }; timers.push(entry); return entry; },
    clearTimer(entry) { entry.cleared = true; },
  };
}

test("resident Builder Review caches one renewable authorization per exact component", async () => {
  const clock = { value: Date.parse("2026-08-27T12:00:00Z") };
  const timers = timerHarness();
  const exchanges = [];
  let issued = 1;
  const session = createHostedPreviewComponentAuthorizationSession({
    initialContext: { kind: HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW, teacherPreview: true, authorization: token(1) },
    initialIdentity: identities.students,
    exchange: async (request) => {
      exchanges.push({ ...request });
      issued += 1;
      return { token: token(issued), expiresAt: new Date(clock.value + 300_000).toISOString() };
    },
    now: () => clock.value,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  for (const identity of Object.values(identities)) await session.ensure(identity);
  for (const identity of [identities.students, identities.workbook, identities.grammar, identities.workbook, identities.students]) await session.ensure(identity);
  assert.deepEqual(exchanges.map((entry) => [entry.sourceComponentSlug, entry.targetComponentSlug]), [
    [identities.students.componentSlug, identities.students.componentSlug],
    [identities.students.componentSlug, identities.workbook.componentSlug],
    [identities.students.componentSlug, identities.grammar.componentSlug],
  ]);
  assert.equal(timers.timers.length, 3);
  assert.equal(timers.timers.every((entry) => entry.delay === 300_000 - HOSTED_COMPONENT_AUTHORIZATION_RENEWAL_MARGIN_MS), true);
  assert.deepEqual(Object.keys(session.snapshot()).sort(), Object.values(identities).map((entry) => entry.componentSlug).sort());

  const workbookBefore = session.contextFor(identities.workbook).authorization;
  clock.value += timers.timers[1].delay;
  await timers.timers[1].callback();
  await Promise.resolve();
  assert.equal(exchanges.at(-1).sourceComponentSlug, identities.workbook.componentSlug);
  assert.equal(exchanges.at(-1).targetComponentSlug, identities.workbook.componentSlug);
  assert.notEqual(session.contextFor(identities.workbook).authorization, workbookBefore);
  assert.equal(session.contextFor(identities.grammar).kind, HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW);
  session.dispose();
});

test("bare and release sessions never broaden authorization across components", async () => {
  const bare = createHostedPreviewComponentAuthorizationSession({
    initialContext: { kind: HOSTED_VIEWER_RUNTIME_MODES.BARE, teacherPreview: false },
    initialIdentity: identities.students,
  });
  assert.equal((await bare.ensure(identities.students)).kind, HOSTED_VIEWER_RUNTIME_MODES.BARE);
  bare.dispose();

  const release = createHostedPreviewComponentAuthorizationSession({
    initialContext: { kind: HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW, teacherPreview: true, authorization: token(1), releaseId: "10000000-0000-4000-8000-000000000099" },
    initialIdentity: identities.students,
  });
  assert.equal((await release.ensure(identities.students)).kind, HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW);
  await assert.rejects(release.ensure(identities.workbook), /cannot exchange/i);
  release.dispose();
});

test("far-future authorization expiry remains one bounded browser timer", async () => {
  const timers = timerHarness();
  const session = createHostedPreviewComponentAuthorizationSession({
    initialContext: { kind: HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW, teacherPreview: true, authorization: token(1) },
    initialIdentity: identities.students,
    exchange: async () => ({ token: token(2), expiresAt: "2099-01-01T00:00:00.000Z" }),
    now: () => Date.parse("2026-08-27T12:00:00Z"),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  await session.ensure(identities.students);
  assert.equal(timers.timers.length, 1);
  assert.equal(timers.timers[0].delay, HOSTED_COMPONENT_AUTHORIZATION_MAX_TIMER_MS);
  session.dispose();
});

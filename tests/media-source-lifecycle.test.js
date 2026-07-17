import test from "node:test";
import assert from "node:assert/strict";
import { captureMediaPlaybackState, restoreMediaPlaybackState } from "../src/services/mediaSourceLifecycle.js";

test("media URL refresh preserves a paused seek position", async () => {
  const before = { currentTime: 74.25, duration: 135, playbackRate: 1.25, volume: 0.7, muted: false, paused: true };
  const snapshot = captureMediaPlaybackState(before, false);
  let plays = 0;
  const after = { currentTime: 0, duration: 135, playbackRate: 1, volume: 1, muted: true, play: async () => { plays += 1; } };
  await restoreMediaPlaybackState(after, snapshot);
  assert.equal(after.currentTime, 74.25);
  assert.equal(after.playbackRate, 1.25);
  assert.equal(after.volume, 0.7);
  assert.equal(after.muted, false);
  assert.equal(plays, 0);
});

test("media URL refresh resumes playback and clamps seeks to duration", async () => {
  const snapshot = { currentTime: 200, playbackRate: 1, volume: 0.8, muted: false, shouldPlay: true };
  let plays = 0;
  const media = { currentTime: 0, duration: 135, playbackRate: 1, volume: 1, muted: false, play: async () => { plays += 1; } };
  await restoreMediaPlaybackState(media, snapshot);
  assert.equal(media.currentTime, 135);
  assert.equal(plays, 1);
});

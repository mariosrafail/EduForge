import assert from "node:assert/strict";
import test from "node:test";

import {
  geometrySnapshotsMatch,
  waitForStableGeometrySamples,
} from "../scripts/book-builder/playwright-layout-stability.mjs";

const snapshot = (geometry, state = ["ready"]) => ({ ready: true, geometry, state });

test("geometry settlement ignores a transient layout and returns consecutive stable samples", async () => {
  const samples = [
    snapshot([0, 0, 1024, 582], ["transcript"]),
    snapshot([40, 10, 942.390625, 535.609375], ["transcript"]),
    snapshot([40, 10, 942.390625, 535.609375], ["transcript"]),
    snapshot([40, 10, 942.390625, 535.609375], ["transcript"]),
  ];
  const result = await waitForStableGeometrySamples(() => samples.shift(), { stableSamples: 3, maxSamples: 4 });
  assert.deepEqual(result.geometry, [40, 10, 942.390625, 535.609375]);
});

test("geometry settlement cannot silently accept continuously moving geometry", async () => {
  let position = 0;
  await assert.rejects(
    waitForStableGeometrySamples(() => Promise.resolve(snapshot([position += 1, 0, 100, 100])), { stableSamples: 3, maxSamples: 6 }),
    /did not stabilize across 3 consecutive animation-frame samples/,
  );
});

test("geometry settlement includes UI state and rejects invalid samples", async () => {
  assert.equal(geometrySnapshotsMatch(snapshot([0, 0, 100, 100], ["questions"]), snapshot([0, 0, 100, 100], ["transcript"])), false);
  assert.equal(geometrySnapshotsMatch(snapshot([0, 0, 100, 100]), { ready: false, geometry: [0, 0, 100, 100], state: ["ready"] }), false);
});

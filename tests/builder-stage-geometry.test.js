import assert from "node:assert/strict";
import test from "node:test";

import {
  clientPointToStage,
  moveStageGeometry,
  percentGeometryToStage,
  resizeStageGeometry,
  stageGeometryToPercent,
  transformStageGeometry,
} from "../src/components/builder-studio/stageGeometry.js";

const stage = { width: 100, height: 80 };
const area = { x: 20, y: 15, width: 40, height: 30 };

test("converts client coordinates through independent canvas scales", () => {
  assert.deepEqual(clientPointToStage(
    { clientX: 260, clientY: 170 },
    { left: 10, top: 20, width: 500, height: 300 },
    { width: 1000, height: 600 },
  ), { x: 500, y: 300, scaleX: 2, scaleY: 2 });
  assert.deepEqual(clientPointToStage(
    { clientX: 60, clientY: 45 },
    { left: 10, top: 20, width: 200, height: 100 },
    { width: 1000, height: 1000 },
  ), { x: 250, y: 250, scaleX: 5, scaleY: 10 });
});

test("moves and clamps geometry at every stage edge", () => {
  assert.deepEqual(moveStageGeometry(area, { x: -50, y: -50 }, stage), { ...area, x: 0, y: 0 });
  assert.deepEqual(moveStageGeometry(area, { x: 100, y: 100 }, stage), { ...area, x: 60, y: 50 });
  assert.deepEqual(moveStageGeometry(area, { x: 5.1254, y: 4.4444 }, stage), { ...area, x: 25.125, y: 19.444 });
});

test("locked geometry cannot move or resize", () => {
  assert.deepEqual(moveStageGeometry(area, { x: 10, y: 10 }, stage, { locked: true }), area);
  assert.deepEqual(resizeStageGeometry(area, "se", { x: 10, y: 10 }, stage, { locked: true }), area);
});

test("resizes north-west with the bottom-right corner anchored", () => {
  assert.deepEqual(resizeStageGeometry(area, "nw", { x: -5, y: -7 }, stage), { x: 15, y: 8, width: 45, height: 37 });
});

test("resizes north-east with the bottom-left corner anchored", () => {
  assert.deepEqual(resizeStageGeometry(area, "ne", { x: 8, y: -5 }, stage), { x: 20, y: 10, width: 48, height: 35 });
});

test("resizes south-west with the top-right corner anchored", () => {
  assert.deepEqual(resizeStageGeometry(area, "sw", { x: -9, y: 6 }, stage), { x: 11, y: 15, width: 49, height: 36 });
});

test("resizes south-east with the top-left corner anchored", () => {
  assert.deepEqual(resizeStageGeometry(area, "se", { x: 12, y: 9 }, stage), { x: 20, y: 15, width: 52, height: 39 });
});

test("corner resize clamps to stage edges and minimum dimensions without crossing", () => {
  assert.deepEqual(resizeStageGeometry(area, "nw", { x: -100, y: -100 }, stage, { minWidth: 8, minHeight: 6 }), { x: 0, y: 0, width: 60, height: 45 });
  assert.deepEqual(resizeStageGeometry(area, "nw", { x: 100, y: 100 }, stage, { minWidth: 8, minHeight: 6 }), { x: 52, y: 39, width: 8, height: 6 });
  assert.deepEqual(resizeStageGeometry(area, "se", { x: 100, y: 100 }, stage), { x: 20, y: 15, width: 80, height: 65 });
  assert.deepEqual(resizeStageGeometry(area, "se", { x: -100, y: -100 }, stage, { minWidth: 8, minHeight: 6 }), { x: 20, y: 15, width: 8, height: 6 });
});

test("aspect-ratio resize preserves ratio and the opposite corner", () => {
  const next = resizeStageGeometry(area, "nw", { x: -10, y: -2 }, stage, { preserveAspectRatio: true });
  assert.equal(next.width / next.height, area.width / area.height);
  assert.equal(next.x + next.width, area.x + area.width);
  assert.equal(next.y + next.height, area.y + area.height);
  const clamped = resizeStageGeometry(area, "se", { x: 1000, y: 1000 }, stage, { preserveAspectRatio: true });
  assert.ok(clamped.x + clamped.width <= stage.width);
  assert.ok(clamped.y + clamped.height <= stage.height);
});

test("pointer transform uses the original geometry and avoids cumulative drift", () => {
  const first = transformStageGeometry({ geometry: area, operation: "move", startPoint: { x: 10, y: 10 }, currentPoint: { x: 10.3333, y: 10.6666 }, stage });
  const repeated = transformStageGeometry({ geometry: area, operation: "move", startPoint: { x: 10, y: 10 }, currentPoint: { x: 10.3333, y: 10.6666 }, stage });
  assert.deepEqual(first, repeated);
  assert.deepEqual(first, { ...area, x: 20.333, y: 15.667 });
});

test("percentage conversion round-trips fractional hotspot geometry", () => {
  const hotspot = { left: 2.123456, top: 9.876543, width: 33.333333, height: 12.345678 };
  const once = stageGeometryToPercent(percentGeometryToStage(hotspot));
  const twice = stageGeometryToPercent(percentGeometryToStage(once));
  assert.deepEqual(once, { left: 2.123, top: 9.877, width: 33.333, height: 12.346 });
  assert.deepEqual(twice, once);
  assert.ok(Object.values(twice).every((value) => Number.isFinite(value) && value >= 0));
});

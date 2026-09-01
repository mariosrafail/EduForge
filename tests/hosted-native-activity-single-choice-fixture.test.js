import assert from "node:assert/strict";
import test from "node:test";

import { sourceRectanglesOverlap } from "../scripts/book-builder/hosted-native-activity-single-choice.mjs";

test("hosted source-rectangle overlap checks distinguish independent hotspot fixtures", () => {
  const answer = { x: 48, y: 190, width: 96, height: 60 };
  assert.equal(sourceRectanglesOverlap(answer, { x: 152, y: 75, width: 24, height: 24 }), false);
  assert.equal(sourceRectanglesOverlap(answer, { x: 144, y: 190, width: 24, height: 24 }), false, "touching edges do not overlap");
  assert.equal(sourceRectanglesOverlap(answer, { x: 120, y: 200, width: 24, height: 24 }), true);
});

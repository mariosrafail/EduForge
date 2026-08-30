import assert from "node:assert/strict";
import test from "node:test";

import { activityBuilderSourcePageId, activityBuilderTypeOptions, buildActivityBuilderNavigation, filterActivityBuilderNavigation, findActivityBuilderItem } from "../src/apps/ultimate-b2-builder/activityBuilderNavigation.js";

const units = [{ id: "unit-1", unitNumber: 1, title: "Unit 1", lessons: [{ id: "lesson-1", title: "Reading", sectionTitle: "Reading", pageLabel: "Pages 6-7", exercises: [
  { stableActivityId: "canonical-read", title: "Read and respond", description: "Find the details", activityType: "open-response" },
  { stableActivityId: "canonical-image", title: "Look at the image", activityType: "image" },
] }] }];
const placements = [{ pageId: "page-6", unitNumber: 1, pageLabel: "Pages 6-7", sectionTitle: "Reading", sortOrder: 2 }];
const nativeActivities = [{ activityId: "native-choice", title: "Choose the best answer", kind: "single-choice", placement: { pageId: "page-6" }, ready: false, issues: ["prompt"] }];

test("navigation merges native drafts into the stable Unit and page hierarchy without mutating inputs", () => {
  const before = structuredClone({ units, placements, nativeActivities });
  const model = buildActivityBuilderNavigation({ units, placements, nativeActivities, isEditable: (id) => id === "canonical-read" });
  assert.deepEqual({ units, placements, nativeActivities }, before);
  assert.equal(model.units[0].pages[0].id, "page-6");
  assert.deepEqual(model.units[0].pages[0].activities.map(({ id }) => id), ["canonical-read", "canonical-image", "native-choice"]);
  assert.equal(findActivityBuilderItem(model, "native-choice").page.pageLabel, "Pages 6-7");
});

test("search and access/type filters use safe catalog metadata and preserve a stable order", () => {
  const model = buildActivityBuilderNavigation({ units, placements, nativeActivities, isEditable: (id) => id === "canonical-read" });
  assert.deepEqual(filterActivityBuilderNavigation(model, { query: "best answer" }).units[0].pages[0].activities.map(({ id }) => id), ["native-choice"]);
  assert.deepEqual(filterActivityBuilderNavigation(model, { access: "editable" }).units[0].pages[0].activities.map(({ id }) => id), ["canonical-read", "native-choice"]);
  assert.deepEqual(filterActivityBuilderNavigation(model, { access: "read-only" }).units[0].pages[0].activities.map(({ id }) => id), ["canonical-image"]);
  assert.deepEqual(filterActivityBuilderNavigation(model, { type: "single-choice" }).units[0].pages[0].activities.map(({ id }) => id), ["native-choice"]);
  assert.deepEqual(activityBuilderTypeOptions(model), ["image", "open-response", "single-choice"]);
});

test("unknown placement falls back to the deterministic Unassigned group", () => {
  const model = buildActivityBuilderNavigation({ units, placements, nativeActivities: [{ ...nativeActivities[0], activityId: "z", placement: { pageId: "missing" } }, { ...nativeActivities[0], activityId: "a", title: "Alpha", placement: { pageId: "missing" } }] });
  assert.deepEqual(model.unassigned.map(({ id }) => id), ["a", "z"]);
  assert.ok(model.unassigned.every((item) => item.assignment.reason === "page-unavailable"));
});

test("deleted-page projection keeps canonical and Student native activities discoverable", () => {
  const model = buildActivityBuilderNavigation({ units, placements, nativeActivities, activePageIds: [] });
  const canonical = findActivityBuilderItem(model, "canonical-read");
  const native = findActivityBuilderItem(model, "native-choice");
  assert.equal(canonical.page, null);
  assert.deepEqual(canonical.item.assignment, { state: "unassigned", reason: "page-deleted" });
  assert.equal(canonical.item.sourcePageId, "page-6");
  assert.equal(native.page, null);
  assert.equal(native.item.native, true);
  assert.deepEqual(native.item.assignment, { state: "unassigned", reason: "page-unavailable" });
  assert.equal(activityBuilderSourcePageId(native), "page-6");
});

test("catalog assignment reasons unify deleted and genuinely unplaced native activities while preserving filters", () => {
  const model = buildActivityBuilderNavigation({ units, placements, activePageIds: ["page-6"], nativeActivities: [
    { ...nativeActivities[0], activityId: "deleted-native", assignment: { state: "unassigned", reason: "page-deleted" }, sourcePageId: "deleted-page" },
    { ...nativeActivities[0], activityId: "unplaced-native", title: "Searchable orphan", placement: { pageId: "missing" }, assignment: { state: "unassigned", reason: "page-unavailable" } },
  ] });
  assert.deepEqual(model.unassigned.map(({ id }) => id), ["deleted-native", "unplaced-native"]);
  assert.deepEqual(filterActivityBuilderNavigation(model, { query: "orphan" }).unassigned.map(({ id }) => id), ["unplaced-native"]);
  assert.deepEqual(filterActivityBuilderNavigation(model, { access: "native" }).unassigned.map(({ id }) => id), ["deleted-native", "unplaced-native"]);
});

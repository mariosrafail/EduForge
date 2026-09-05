import assert from "node:assert/strict";
import test from "node:test";
import { componentActivityOrderEntries, normalizeComponentActivityOrder, projectComponentActivityOrder, reorderComponentActivity } from "../src/data/native-activities/nativeActivityOrder.js";
import { normalizeUltimateB2ActivityLifecycle } from "../src/data/ultimate-b2/activityLifecycle.js";

test("mixed page reorder persists only canonical/native sort positions and preserves hidden records", () => {
  const canonical = [{ activityKey: "canonical-a", pageId: "page-a" }, { activityKey: "canonical-b", pageId: "page-a" }, { activityKey: "other", pageId: "page-b" }];
  const index = { schemaVersion: "1.0", activities: [{ activityId: "native-a", kind: "image", placement: { pageId: "page-a" }, sortOrder: 2 }] };
  const lifecycle = { schemaVersion: "1.0", activities: {} };
  const result = reorderComponentActivity({ canonical, index, lifecycle, pageId: "page-a", activityId: "native-a", direction: "up" });
  assert.deepEqual(result.activityIds, ["canonical-a", "native-a", "canonical-b"]);
  assert.equal(result.index.activities[0].sortOrder, 1);
  assert.deepEqual(result.index.activities[0].placement, index.activities[0].placement);
  assert.equal(result.lifecycle.activities["canonical-b"].sortOrder, 2);
  assert.deepEqual(lifecycle.activities, {});
  const reloaded = normalizeUltimateB2ActivityLifecycle(JSON.parse(JSON.stringify(result.lifecycle)));
  assert.deepEqual(projectComponentActivityOrder(componentActivityOrderEntries(canonical, result.index, reloaded))["page-a"], result.activityIds);
  assert.throws(() => reorderComponentActivity({ canonical, index, lifecycle, pageId: "page-a", activityId: "canonical-a", direction: "up" }), /boundary/);
  assert.throws(() => reorderComponentActivity({ canonical, index, lifecycle, pageId: "page-b", activityId: "native-a", direction: "down" }), /boundary/);
  assert.deepEqual(componentActivityOrderEntries(canonical, index, { ...lifecycle, activities: { "canonical-b": { status: "retired", pageId: "page-a" } } }).map((entry) => entry.activityId).sort(), ["canonical-a", "native-a", "other"]);
});

test("order projection rejects duplicate identities and malformed records", () => {
  assert.throws(() => normalizeComponentActivityOrder({ "page-a": [7] }), /identities/);
  assert.throws(() => normalizeComponentActivityOrder({ "page-a": ["same"], "page-b": ["same"] }), /identities/);
  assert.throws(() => normalizeUltimateB2ActivityLifecycle({ schemaVersion: "1.0", activities: { id: { status: "active", pageId: "page-a", sortOrder: -1 } } }), /order/);
  assert.deepEqual(normalizeComponentActivityOrder({ "page-a": ["id-a", "id-b"] }), { "page-a": ["id-a", "id-b"] });
});


test("native-only order is deterministic across ties, moves and deletion and never joins page identities", () => {
  const index = { activities: [
    { activityId: "native-b", placement: { pageId: "page-one" }, sortOrder: 4 },
    { activityId: "native-a", placement: { pageId: "page-one" }, sortOrder: 4 },
    { activityId: "native-c", placement: { pageId: "page-two" }, sortOrder: 0 },
  ] };
  const lifecycle = { activities: {} };
  const project = () => projectComponentActivityOrder(componentActivityOrderEntries([], index, lifecycle));
  assert.deepEqual(project(), { "page-two": ["native-c"], "page-one": ["native-a", "native-b"] });
  const moved = reorderComponentActivity({ canonical: [], index, lifecycle, pageId: "page-one", activityId: "native-b", direction: "up" });
  assert.deepEqual(moved.activityIds, ["native-b", "native-a"]);
  assert.equal(new Set(moved.index.activities.filter((entry) => entry.placement.pageId === "page-one").map((entry) => entry.sortOrder)).size, 2);
  index.activities[0].placement.pageId = "page-two";
  assert.deepEqual(project()["page-one"], ["native-a"]);
  assert.deepEqual(project()["page-two"], ["native-c", "native-b"]);
  index.activities = index.activities.filter((entry) => entry.activityId !== "native-c");
  assert.deepEqual(project()["page-two"], ["native-b"]);
  assert.throws(() => reorderComponentActivity({ canonical: [], index, lifecycle, pageId: "page-one", activityId: "native-a", direction: "down" }), /boundary/);
});

import assert from "node:assert/strict";
import test from "node:test";

import { createManagedNativeActivityAdapter } from "../netlify-sites/ultimate-b2-builder/server/_managed-native-activity-adapter.js";
import {
  createEmptyManagedComponentHotspotManifest,
  validateAndNormalizeManagedComponentHotspotManifest,
} from "../scripts/ultimate-b2/hotspot-manifest.js";
import { createNoopStartupAssets, runInteractiveViewerStartup } from "../src/apps/android-teacher-offline/interactiveStartupAssets.js";
import {
  createManagedReviewContentPackProvider,
  createManagedReviewHotspotProvider,
  managedPageUnitsFromCatalog,
} from "../src/apps/android-teacher-offline/managedReviewRuntime.js";

const workbook = "ultimate-b2-workbook";
const grammar = "ultimate-b2-grammar-book";
const activity = "ultimate-b2-wb-managed-page-o1";
const pages = [{ id: "wb-page-one", unitNumber: 1 }, { id: "wb-page-two", unitNumber: 2 }];

test("managed hotspot manifests accept empty page maps and enforce page, activity, identity, and geometry scope", () => {
  for (const componentSlug of [workbook, grammar]) {
    assert.deepEqual(validateAndNormalizeManagedComponentHotspotManifest(createEmptyManagedComponentHotspotManifest(componentSlug), { componentSlug, pages: [], activities: [] }).pages, {});
  }
  const document = {
    schemaVersion: "1.0", packageSlug: "ultimate-b2", componentSlug: workbook,
    pages: { "wb-page-one": [{ id: "hotspot-one", unitNumber: 1, pageId: "wb-page-one", left: 10, top: 20, width: 30, height: 40, label: "Open", actionType: "normalized_activity", activityKey: activity }] },
  };
  const normalized = validateAndNormalizeManagedComponentHotspotManifest(document, { componentSlug: workbook, pages, activities: [{ activityId: activity, title: "Workbook activity" }] });
  assert.equal(normalized.pages["wb-page-one"][0].activityKey, activity);
  assert.throws(() => validateAndNormalizeManagedComponentHotspotManifest(document, { componentSlug: workbook, pages: [{ id: "wb-page-two", unitNumber: 2 }], activities: [{ activityId: activity }] }), /Unknown managed component page/);
  assert.throws(() => validateAndNormalizeManagedComponentHotspotManifest(document, { componentSlug: workbook, pages, activities: [{ activityId: "ultimate-b2-gb-foreign-o1" }] }), /unavailable activityKey/);
  const overflow = structuredClone(document); overflow.pages["wb-page-one"][0].width = 91;
  assert.throws(() => validateAndNormalizeManagedComponentHotspotManifest(overflow, { componentSlug: workbook, pages, activities: [{ activityId: activity }] }), /within the page image/);
  assert.throws(() => validateAndNormalizeManagedComponentHotspotManifest({ ...document, componentSlug: grammar }, { componentSlug: workbook, pages, activities: [{ activityId: activity }] }), /identity/);
});

test("managed native adapters derive authoritative Unit placement and keep Workbook and Grammar identities disjoint", async () => {
  const observed = [];
  const sql = async (strings, ...values) => {
    observed.push({ text: strings.join("?"), values });
    return [{ stable_key: `${workbook}/pages/wb-page-one`, sort_order: 7, unit_id: "20000000-0000-4000-8000-000000000001", unit_number: "3", unit_title: "Unit 3" }];
  };
  const workbookAdapter = createManagedNativeActivityAdapter(workbook);
  const placement = await workbookAdapter.normalizePlacement({ pageId: "wb-page-one", unitNumber: 9 }, { sql, bookSlug: "ultimate-b2", componentSlug: workbook });
  assert.deepEqual(placement, { pageId: "wb-page-one", unitId: "20000000-0000-4000-8000-000000000001", unitNumber: 3, unitTitle: "Unit 3", sortOrder: 7 });
  assert.ok(observed[0].values.includes(`${workbook}/pages/wb-page-one`));
  await assert.rejects(workbookAdapter.normalizePlacement({ pageId: "gb-page-one" }, { sql, bookSlug: "ultimate-b2", componentSlug: grammar }), /invalid/);
  const workbookId = workbookAdapter.nextActivityId({ placement, nativeIndex: { activities: [] } });
  const grammarId = createManagedNativeActivityAdapter(grammar).nextActivityId({ placement: { ...placement, pageId: "gb-page-one" }, nativeIndex: { activities: [] } });
  assert.match(workbookId, /^ultimate-b2-wb-/);
  assert.match(grammarId, /^ultimate-b2-gb-/);
  assert.notEqual(workbookId, grammarId);
});

function managedCatalog(componentSlug) {
  const units = Array.from({ length: 10 }, (_, index) => ({ id: `${componentSlug}-unit-${index + 1}`, slug: `unit-${index + 1}`, title: `Unit ${index + 1}`, unitNumber: index + 1, sortOrder: index + 1 }));
  return {
    revision: 3, component: { bookSlug: "ultimate-b2", componentSlug, kind: "managed", title: componentSlug === workbook ? "Workbook" : "Grammar Book" }, units,
    pages: [1, 2].map((number) => ({ id: `${componentSlug}-page-${number}`, componentSlug, unitId: units[0].id, label: `Page ${number}`, printedLabel: String(number), sortOrder: number, image: { source: "managed", url: `/preview/pages/${componentSlug}/${number}` } })),
  };
}

test("managed hosted runtime starts and browses a ten-Unit two-page pack with zero activities and hotspots", async () => {
  const payload = managedCatalog(workbook);
  const mapped = managedPageUnitsFromCatalog(payload, workbook);
  assert.equal(mapped.length, 10);
  assert.deepEqual(mapped[0].pages.map((page) => page.id), [`${workbook}-page-1`, `${workbook}-page-2`]);
  assert.ok(mapped.every((unit) => Array.isArray(unit.pages)));
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", { configurable: true, value: { search: `?builderPreview=1&previewAuthorization=v2.payload.${"a".repeat(43)}` } });
  try {
    const fetchImpl = async (url) => ({
      ok: true,
      async json() {
        return String(url).startsWith("/preview/pages/") ? payload : { bookSlug: "ultimate-b2", componentSlug: workbook, resource: "hotspots", schemaVersion: "1.0", revision: 0, source: "repository", document: createEmptyManagedComponentHotspotManifest(workbook) };
      },
    });
    const content = createManagedReviewContentPackProvider(workbook);
    const hotspots = createManagedReviewHotspotProvider(workbook);
    const states = [];
    const result = await runInteractiveViewerStartup({
      loadContentPack: () => content.load({ fetchImpl }),
      prepareHotspots: () => hotspots.prepare({ fetchImpl }),
      startupAssets: createNoopStartupAssets(),
      onState: (state) => states.push(state),
    });
    assert.equal(result.pack.pageUnits[0].pages.length, 2);
    assert.deepEqual(result.pack.activities.activities, []);
    assert.deepEqual(hotspots.getActions({ pageId: `${workbook}-page-1` }), []);
    assert.equal(states.at(-1).status, "ready");
  } finally {
    if (previousLocation) Object.defineProperty(globalThis, "location", previousLocation);
    else delete globalThis.location;
  }
});

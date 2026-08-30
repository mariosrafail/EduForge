import assert from "node:assert/strict";

export async function assertManagedComponentActivityLifecycle({
  page,
  componentSlug,
  componentTitle,
  activityId,
  managedNativeState,
  managedComponentCatalog,
}) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByLabel("Activity title").waitFor();
  assert.equal(await page.getByLabel("Activity title").inputValue(), `${componentTitle} saved image`);
  await page.getByRole("button", { name: "Move Activity" }).click();
  const destination = managedComponentCatalog.pages[1].id;
  const moveDialog = page.getByRole("dialog", { name: "Move activity" });
  await moveDialog.getByLabel("Destination").selectOption(destination);
  await moveDialog.getByRole("button", { name: "Move Activity", exact: true }).click();
  await page.getByText("Activity moved. Open the destination page in Hotspots and place one deliberate launch hotspot.", { exact: true }).waitFor();
  assert.equal(managedNativeState.index.document.activities[0].placement.pageId, destination);
  assert.equal(managedNativeState.documents.get(`native_activity_public:${activityId}`).document.placement.pageId, destination);

  const deletedPage = managedComponentCatalog.pages.find((candidate) => candidate.id === destination);
  deletedPage.isActive = false;
  deletedPage.removedHotspotCount = 0;
  deletedPage.preservedActivityCount = 1;
  managedComponentCatalog.revision += 1;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Unassigned", exact: true }).waitFor();
  assert.equal(await page.getByText(`${componentTitle} activities could not be loaded.`, { exact: true }).count(), 0);
  await page.getByRole("button", { name: new RegExp(activityId) }).click();
  await page.getByRole("heading", { name: `${componentTitle} saved image`, exact: true }).waitFor();
  await page.getByRole("button", { name: "Move Activity", exact: true }).click();
  const rescueDestination = managedComponentCatalog.pages[2].id;
  const rescueDialog = page.getByRole("dialog", { name: "Move activity" });
  await rescueDialog.getByLabel("Destination").selectOption(rescueDestination);
  await rescueDialog.getByRole("button", { name: "Move Activity", exact: true }).click();
  await page.getByText("Activity moved. Open the destination page in Hotspots and place one deliberate launch hotspot.", { exact: true }).waitFor();
  assert.equal(managedNativeState.index.document.activities[0].placement.pageId, rescueDestination);
  assert.equal(managedNativeState.documents.get(`native_activity_public:${activityId}`).document.placement.pageId, rescueDestination);
  assert.equal(Object.values(managedNativeState.hotspots.document.pages).flat().some((hotspot) => hotspot.activityKey === activityId), false, "moving an Unassigned activity must not create a hotspot");
  deletedPage.isActive = true;
  managedComponentCatalog.revision += 1;
  assert.equal(Object.values(managedNativeState.hotspots.document.pages).flat().some((hotspot) => hotspot.activityKey === activityId), false, "restoring the page must not recreate its hotspot");
}

export async function assertDelayedManagedComponentCatalogIsolation({
  page,
  origin,
  components,
  enableDelayedWorkbookCatalog,
}) {
  enableDelayedWorkbookCatalog();
  await page.goto(`${origin}/#/books/ultimate-b2/components/${components.workbook}/activities`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(40);
  await page.goto(`${origin}/#/books/ultimate-b2/components/${components.grammar}/activities`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Activity title").waitFor();
  assert.equal(await page.getByLabel("Activity title").inputValue(), "Grammar Book saved image");
  assert.equal((await page.locator("body").innerText()).includes("ultimate-b2-wb-"), false, "a delayed Workbook catalog cannot repopulate Grammar state");
  await page.goto(`${origin}/#/books/ultimate-b2/components/${components.workbook}/activities`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Activity title").waitFor();
  assert.equal(await page.getByLabel("Activity title").inputValue(), "Workbook saved image");
  await page.goto(`${origin}/#/books/ultimate-b2/components/ultimate-b2-students-book/activities`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Activity authoring" }).waitFor();
  assert.equal((await page.locator("body").innerText()).includes("ultimate-b2-wb-"), false);
  assert.equal((await page.locator("body").innerText()).includes("ultimate-b2-gb-"), false);
}

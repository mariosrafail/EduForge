import assert from "node:assert/strict";
import test from "node:test";

import {
  VALIDATION_CAPABILITY_KEYS,
  missingCertificationCapabilities,
  selectValidationProjects,
} from "../scripts/book-builder/review-studio-validator.mjs";

function project(projectId, capabilities) {
  return {
    projectId,
    capabilities: {
      overviewAvailable: true,
      componentsAvailable: true,
      pagesAvailable: true,
      menuAvailable: true,
      activitiesAvailable: false,
      structuredActivitiesAvailable: false,
      rasterGapActivitiesAvailable: false,
      activityClustersAvailable: false,
      reviewReasonsAvailable: true,
      diffAvailable: true,
      pagePreviewAvailable: true,
      normalizedHotspotsAvailable: true,
      ...capabilities,
    },
  };
}

test("validator capability model includes every required safe view capability", () => {
  assert.deepEqual(VALIDATION_CAPABILITY_KEYS, [
    "overviewAvailable",
    "componentsAvailable",
    "pagesAvailable",
    "menuAvailable",
    "activitiesAvailable",
    "activityClustersAvailable",
    "reviewReasonsAvailable",
    "diffAvailable",
    "pagePreviewAvailable",
    "normalizedHotspotsAvailable",
  ]);
});

test("mixed workspace selection ignores ordering and chooses the current capable project", () => {
  const older = project("aaa-older-project", {});
  const current = project("zzz-current-project", {
    activitiesAvailable: true,
    structuredActivitiesAvailable: true,
    rasterGapActivitiesAvailable: true,
    activityClustersAvailable: true,
  });
  const selections = selectValidationProjects([older, current]);
  assert.equal(selections.certification, current.projectId);
  assert.equal(selections.activities, current.projectId);
  assert.equal(selections.structuredActivities, current.projectId);
  assert.equal(selections.rasterGapActivities, current.projectId);
  assert.equal(selections.activityClusters, current.projectId);
  assert.deepEqual(missingCertificationCapabilities([older, current]), []);
});

test("old-only workspace reports structured missing capabilities without inventing data", () => {
  const older = project("older-only", {});
  const selections = selectValidationProjects([older]);
  assert.equal(selections.certification, null);
  assert.equal(selections.pages, older.projectId);
  assert.equal(selections.activities, null);
  assert.equal(selections.activityClusters, null);
  assert.deepEqual(missingCertificationCapabilities([older]), [
    "activitiesAvailable",
    "structuredActivitiesAvailable",
    "rasterGapActivitiesAvailable",
    "activityClustersAvailable",
  ]);
});

test("flow coverage can be selected from separate capable projects deterministically", () => {
  const pages = project("pages-project", {
    activitiesAvailable: false,
    reviewReasonsAvailable: false,
  });
  const activities = project("activities-project", {
    pagesAvailable: false,
    pagePreviewAvailable: false,
    normalizedHotspotsAvailable: false,
    activitiesAvailable: true,
    structuredActivitiesAvailable: true,
    rasterGapActivitiesAvailable: true,
    activityClustersAvailable: true,
  });
  const selections = selectValidationProjects([pages, activities]);
  assert.equal(selections.pages, pages.projectId);
  assert.equal(selections.certification, activities.projectId);
  assert.equal(selections.activities, activities.projectId);
  assert.equal(selections.activityClusters, activities.projectId);
  assert.deepEqual(missingCertificationCapabilities([pages, activities]), []);
});

test("split current activity capabilities do not qualify as one certification project", () => {
  const structured = project("structured-project", {
    activitiesAvailable: true,
    structuredActivitiesAvailable: true,
    rasterGapActivitiesAvailable: true,
  });
  const clusters = project("cluster-project", { activityClustersAvailable: true });
  assert.equal(selectValidationProjects([structured, clusters]).certification, null);
  assert.deepEqual(missingCertificationCapabilities([structured, clusters]), ["currentActivityCapabilitiesCoLocated"]);
});

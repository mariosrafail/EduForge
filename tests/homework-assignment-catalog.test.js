import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAssignmentCatalogState,
  buildHomeworkActivityOptions,
  compatibleHomeworkActivityOptions,
  homeworkItemRequest,
  homeworkPackageCompatibilityIssue,
} from "../src/components/lms/teacher/homeworkUiModel.js";

const ids = Object.freeze({
  b1: "10000000-0000-4000-8000-000000000001",
  b1Plus: "10000000-0000-4000-8000-000000000002",
  b2: "10000000-0000-4000-8000-000000000003",
  activityB1: "20000000-0000-4000-8000-000000000001",
  activityB1Plus: "20000000-0000-4000-8000-000000000002",
  activityB2: "20000000-0000-4000-8000-000000000003",
  activityDisabled: "20000000-0000-4000-8000-000000000004",
  release: "30000000-0000-4000-8000-000000000001",
});

function packageTree({ id, slug, title, activityId, empty = false }) {
  return {
    id,
    slug,
    packageTitle: title,
    components: [{
      id: `${slug}-component`,
      slug: `${slug}-students-book`,
      title: "Students Book",
      sortOrder: 1,
      units: empty ? [] : [{
        id: `${slug}-unit-1`,
        title: "Unit 1",
        sortOrder: 1,
        lessons: [{
          id: `${slug}-lesson-1`,
          title: "Reading",
          sortOrder: 1,
          exercises: [
            { title: "Shared title", assignmentActivityId: activityId, sortOrder: 1 },
            { title: "Catalog shell only", id: `${slug}-fake`, sortOrder: 2 },
            { title: "Disabled", assignmentActivityId: ids.activityDisabled, assignable: false, sortOrder: 3 },
          ],
        }],
      }],
    }],
  };
}

const trees = [
  packageTree({ id: ids.b1, slug: "ultimate-b1", title: "Ultimate B1", activityId: ids.activityB1 }),
  packageTree({ id: ids.b1Plus, slug: "ultimate-b1-plus", title: "Ultimate B1+", activityId: ids.activityB1Plus }),
  packageTree({ id: ids.b2, slug: "ultimate-b2", title: "Ultimate B2", activityId: ids.activityB2 }),
];
const native = {
  target: { kind: "published_native", releaseId: ids.release, nativeActivityId: "native-open-response" },
  title: "Shared title",
  nativeKind: "open-response",
  packageId: ids.b2,
  packageSlug: "ultimate-b2",
  packageTitle: "Ultimate B2",
  componentId: "ultimate-b2-students-book",
  componentSlug: "ultimate-b2-students-book",
  componentTitle: "Students Book",
  releaseNumber: 7,
  assignable: true,
};

test("multi-package assignment options contain only real canonical targets with deterministic identities", () => {
  const options = buildHomeworkActivityOptions([trees[2], trees[0], trees[1], trees[0]], [native, native]);
  assert.deepEqual(options.map((item) => item.packageSlug), ["ultimate-b1", "ultimate-b1-plus", "ultimate-b2", "ultimate-b2"]);
  assert.equal(options.length, 4, "canonical duplicate identities are removed, title duplicates are retained");
  assert.deepEqual(options.map((item) => item.id), [
    `legacy_activity:${ids.activityB1}`,
    `legacy_activity:${ids.activityB1Plus}`,
    `legacy_activity:${ids.activityB2}`,
    `published_native:${ids.release}:native-open-response`,
  ]);
  assert.ok(options.every((item) => item.label.includes(item.packageTitle) && item.label.includes(item.componentTitle)));
  assert.deepEqual(homeworkItemRequest(options[0]), { kind: "legacy_activity", activityId: ids.activityB1 });
  assert.deepEqual(homeworkItemRequest(options[3]), native.target);
  assert.deepEqual(
    buildHomeworkActivityOptions([...trees].reverse(), [native]).map((item) => item.id),
    buildHomeworkActivityOptions(trees, [native]).map((item) => item.id),
  );
});

test("empty managed shells and non-database identifiers never synthesize assignment activities", () => {
  const emptyB1 = packageTree({ id: ids.b1, slug: "ultimate-b1", title: "Ultimate B1", activityId: ids.activityB1, empty: true });
  const shell = packageTree({ id: ids.b1Plus, slug: "ultimate-b1-plus", title: "Ultimate B1+", activityId: "not-a-database-uuid" });
  assert.deepEqual(buildHomeworkActivityOptions([emptyB1, shell]), []);
});

test("catalog sources fail independently and distinguish valid empty results from failures", () => {
  const common = { packageTrees: trees, packageLoaded: true, nativeTargets: [native], nativeLoaded: true };
  assert.equal(buildAssignmentCatalogState(common).options.length, 4);

  const nativeFailure = buildAssignmentCatalogState({ ...common, nativeTargets: [], nativeLoaded: false, nativeError: "integrity unavailable" });
  assert.equal(nativeFailure.options.length, 3);
  assert.match(nativeFailure.warning, /Published activities/);
  assert.equal(nativeFailure.unavailable, false);

  const packageFailure = buildAssignmentCatalogState({ ...common, packageTrees: [], packageLoaded: false, packageError: "tree unavailable" });
  assert.deepEqual(packageFailure.options.map((item) => item.targetKind), ["published_native"]);
  assert.match(packageFailure.warning, /Book activities/);
  assert.equal(packageFailure.unavailable, false);

  const bothFailure = buildAssignmentCatalogState({ packageError: "tree unavailable", nativeError: "integrity unavailable" });
  assert.deepEqual(bothFailure.options, []);
  assert.equal(bothFailure.unavailable, true);

  const validEmpty = buildAssignmentCatalogState({ packageTrees: [], packageLoaded: true, nativeTargets: [], nativeLoaded: true });
  assert.deepEqual(validEmpty.options, []);
  assert.equal(validEmpty.warning, "");
  assert.equal(validEmpty.unavailable, false);
});

test("selected class packages filter activities and stale incompatible selections are rejected", () => {
  const options = buildHomeworkActivityOptions(trees, [native]);
  const classes = [
    { id: "class-b1", name: "B1 A", bookPackageId: ids.b1 },
    { id: "class-b1-2", name: "B1 B", bookPackageId: ids.b1 },
    { id: "class-b2", name: "B2 A", bookPackageId: ids.b2 },
    { id: "class-legacy", name: "Legacy", bookPackageId: null },
  ];
  assert.deepEqual(compatibleHomeworkActivityOptions(options, classes, ["class-b1", "class-b1-2"]).options.map((item) => item.packageId), [ids.b1]);
  assert.equal(homeworkPackageCompatibilityIssue(classes, ["class-b1", "class-b2"], []).conflict, "mixed-class-packages");
  assert.equal(homeworkPackageCompatibilityIssue(classes, ["class-legacy"], []).conflict, "class-package-unassigned");
  assert.equal(homeworkPackageCompatibilityIssue(classes, ["class-b1"], [options.find((item) => item.packageId === ids.b2)]).conflict, "class-package-mismatch");
});

test("Teacher Assignments reuses portal package state and has no B2-only catalog request", async () => {
  const [portal, section] = await Promise.all([
    readFile("src/components/lms/teacher/TeacherPortal.jsx", "utf8"),
    readFile("src/components/lms/teacher/sections/TeacherAssignmentsSection.jsx", "utf8"),
  ]);
  assert.match(portal, /bookPackages=\{bookPackages\}/);
  assert.match(portal, /bookLoadError=\{bookStateIsCurrent \? teacherBooksState\.error : ""\}/);
  assert.doesNotMatch(section, /getBookPackageTreeWithFallback/);
  assert.doesNotMatch(section, /Promise\.all\(\[getBookPackageTree/);
  assert.match(section, /buildAssignmentCatalogState/);
  assert.match(section, /nativeCatalog\.ownerId === \(currentUser\?\.id \|\| null\)/);
});

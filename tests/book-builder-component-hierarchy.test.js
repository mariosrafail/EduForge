import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyHierarchyGrouping,
  componentHierarchyKey,
  hierarchyGroupLabel,
  legacyComponentDecisionTargetId,
  projectEffectiveBookHierarchy,
  unitGroupHierarchyKey,
  validateBookHierarchy,
} from "../lib/book-builder/book-hierarchy.js";
import { componentDecisionTargetId } from "../lib/book-builder/decision-dependencies.js";
import { buildUltimateHierarchy } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-hierarchy.js";

function unit(number, { parts = 1 } = {}) {
  return {
    number,
    sourceRelativePath: `Contents/Resources/assets/books/book1/unit/${number}`,
    parts: Array.from({ length: parts }, (_, index) => ({ number: index + 1, objectCount: index + 1 })),
  };
}

function component(name, role, numbers, root = "book1") {
  return {
    name,
    sourceBookRoot: root,
    sourceRelativePath: `Contents/Resources/assets/books/${root}/${name}`,
    proposedSemanticRole: role,
    roleConfidence: role ? 0.75 : 0.4,
    units: numbers.map((number) => ({ ...unit(number), sourceRelativePath: `Contents/Resources/assets/books/${root}/${name}/${number}` })),
  };
}

function fixture() {
  const oneToTen = Array.from({ length: 10 }, (_, index) => index + 1);
  const components = [
    component("unit", "students_book", oneToTen),
    component("work", "workbook", oneToTen),
    component("grammar", "grammar_book", oneToTen),
    component("test", "tests", [1, 2, 3, 11, 17]),
    component("video", "video", [1]),
    component("unit", "students_book", [1], "book2"),
    component("missing", "students_book", [1, 2, 3, 5]),
    component("duplicate", "students_book", [1, 1, 2]),
    component("eleven", "students_book", [...oneToTen, 11]),
    component("unknown", null, [1]),
  ];
  const pages = { spreads: components.flatMap((item) => item.units.map((entry) => ({
    sourceBookRoot: item.sourceBookRoot,
    component: item.name,
    unit: entry.number,
    part: 1,
  }))) };
  const activities = { records: pages.spreads.map((page, index) => ({
    sourceObjectLocator: `Contents/Resources/assets/books/${page.sourceBookRoot}/${page.component}/${page.unit}/part1/obj${index + 1}`,
  })) };
  const hotspots = { parts: pages.spreads.map((page) => ({ ...page })) };
  const reviews = { items: [{ sourceRelativeLocator: "Contents/Resources/assets/books/book1/work/3/part1/obj1/content" }] };
  const menu = {
    sourceBookRoot: "book1",
    buttons: [
      ...oneToTen.map((number) => ({ id: `menu_${number}`, sourceBookRoot: "book1", proposedDestination: { kind: "unit", unit: number } })),
      { id: "menu_work", sourceBookRoot: "book1", proposedDestination: { kind: "component", role: "workbook" } },
      { id: "menu_grammar", sourceBookRoot: "book1", proposedDestination: { kind: "component", role: "grammar_book" } },
      { id: "menu_extras", sourceBookRoot: "book1", proposedDestination: { kind: "component", role: "extras" } },
    ],
  };
  return buildUltimateHierarchy({ structure: { components }, pages, hotspots, activities, reviews, menu });
}

test("parent-scoped hierarchy keys distinguish roots, components, and repeated Unit numbers", () => {
  assert.notEqual(componentHierarchyKey("book1", "unit"), componentHierarchyKey("book2", "unit"));
  assert.notEqual(unitGroupHierarchyKey("book1", "unit", 1), unitGroupHierarchyKey("book1", "work", 1));
  assert.notEqual(unitGroupHierarchyKey("book1", "work", 1), unitGroupHierarchyKey("book1", "grammar", 1));
  assert.equal(unitGroupHierarchyKey("book1", "unit", 1), unitGroupHierarchyKey("book1", "unit", 1));
});

test("grouping classification never turns supplementary numeric folders into pedagogical Units", () => {
  assert.equal(classifyHierarchyGrouping({ role: "students_book", sourceNumbers: [1, 2, 3] }), "numbered_units");
  assert.equal(classifyHierarchyGrouping({ role: "tests", sourceNumbers: [1, 2, 11, 17] }), "numbered_groups");
  assert.equal(classifyHierarchyGrouping({ role: "video", sourceNumbers: [1] }), "supplementary_collection");
  assert.equal(hierarchyGroupLabel("numbered_units", 3), "Unit 3");
  assert.equal(hierarchyGroupLabel("numbered_groups", 3), "Group 3");
});

test("Ultimate hierarchy is deterministic, multi-root safe, and records structural warnings", () => {
  const first = fixture();
  const second = fixture();
  assert.deepEqual(first, second);
  assert.equal(first.sourceBookRoots.length, 2);
  const book1 = first.sourceBookRoots.find((root) => root.sourceBookRootName === "book1");
  const book2 = first.sourceBookRoots.find((root) => root.sourceBookRootName === "book2");
  assert.notEqual(book1.components.find((item) => item.sourceComponentName === "unit").componentKey, book2.components[0].componentKey);
  assert.equal(book1.components.find((item) => item.sourceComponentName === "test").groupingKind, "numbered_groups");
  assert.ok(first.warnings.some((item) => item.code === "non_contiguous_source_numbers"));
  assert.ok(first.warnings.some((item) => item.code === "duplicate_scoped_source_number"));
  assert.ok(first.warnings.some((item) => item.code === "principal_source_number_without_menu_destination"));
  assert.ok(first.warnings.some((item) => item.code === "unknown_component_role"));
  assert.equal(first.menuEvidence.find((item) => item.menuButtonId === "menu_work").status, "matched");
  assert.equal(first.menuEvidence.find((item) => item.menuButtonId === "menu_extras").status, "supplementary_destination");
});

test("effective component roles remain a decision overlay and stale roles do not apply", () => {
  const hierarchy = fixture();
  const unknown = hierarchy.sourceBookRoots[0].components.find((item) => item.sourceComponentName === "unknown");
  const approved = { kind: "component_role", targetId: unknown.decisionTargetId, value: "practice", approvalState: "approved", stale: false };
  const projected = projectEffectiveBookHierarchy(hierarchy, [approved]);
  const effective = projected.sourceBookRoots[0].components.find((item) => item.componentKey === unknown.componentKey);
  assert.equal(effective.effectiveRole, "practice");
  assert.equal(effective.displayName, "Practice");
  assert.equal(effective.effectiveGroupingKind, "supplementary_collection");
  const stale = projectEffectiveBookHierarchy(hierarchy, [{ ...approved, stale: true }]).sourceBookRoots[0].components.find((item) => item.componentKey === unknown.componentKey);
  assert.equal(stale.effectiveRole, null);
  assert.equal(stale.decisionStale, true);
});

test("legacy component decision identities are unchanged", () => {
  const target = { name: "unit", sourceRelativePath: "Contents/Resources/assets/books/book1/unit" };
  assert.equal(legacyComponentDecisionTargetId(target.sourceRelativePath), componentDecisionTargetId(target));
});

test("hierarchy artifacts reject absolute paths and answer-bearing data", () => {
  const hierarchy = fixture();
  assert.equal(validateBookHierarchy(hierarchy).valid, true);
  assert.equal(validateBookHierarchy({ ...hierarchy, diagnosticPath: "C:\\publisher\\source" }).valid, false);
  assert.equal(validateBookHierarchy({ ...hierarchy, correctAnswer: "FICTIONAL_TEACHER_ONLY_4C1" }).valid, false);
  assert.doesNotMatch(JSON.stringify(hierarchy), /FICTIONAL_TEACHER_ONLY_4C1/);
});

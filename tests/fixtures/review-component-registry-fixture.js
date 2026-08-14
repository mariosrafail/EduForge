export const syntheticReviewCatalog = Object.freeze([Object.freeze({
  id: "test-book",
  slug: "test-book",
  title: "Test-only Book",
  components: Object.freeze([
    Object.freeze({ id: "test-book-students", slug: "test-book-students", bookSlug: "test-book", title: "Students", type: "students_book", reviewState: "installed", teacherEditionId: "students-book" }),
    Object.freeze({ id: "test-book-workbook", slug: "test-book-workbook", bookSlug: "test-book", title: "Workbook", type: "workbook", reviewState: "installed", teacherEditionId: "workbook" }),
    Object.freeze({ id: "test-book-pending", slug: "test-book-pending", bookSlug: "test-book", title: "Pending", type: "grammar_book", reviewState: "pending", teacherEditionId: "grammar-book" }),
  ]),
})]);

function runtime(componentSlug, marker) {
  return Object.freeze({
    bookSlug: "test-book",
    componentSlug,
    contentPackProvider: Object.freeze({ async load() { return { marker, activities: { activities: [{ stableActivityId: "shared-activity", marker }] } }; } }),
    pageUnits: Object.freeze([{ number: 1, pages: [{ id: "shared-page", marker }] }]),
    hotspotProvider: Object.freeze({ getActions: () => [{ id: `hotspot-${marker}` }] }),
    solutionProvider: Object.freeze({ get: () => `solution-${marker}` }),
  });
}

export const syntheticStudentsRuntime = runtime("test-book-students", "students");
export const syntheticWorkbookRuntime = runtime("test-book-workbook", "workbook");

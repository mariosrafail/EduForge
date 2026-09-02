export const emptyShellPackages = Object.freeze([
  Object.freeze({
    bookSlug: "ultimate-b1",
    bookTitle: "Ultimate English B1",
    components: Object.freeze([
      Object.freeze({ componentSlug: "ultimate-b1-students-book", componentTitle: "Students Book" }),
      Object.freeze({ componentSlug: "ultimate-b1-workbook", componentTitle: "Workbook" }),
      Object.freeze({ componentSlug: "ultimate-b1-grammar-book", componentTitle: "Grammar Book" }),
    ]),
    testBookSlug: "ultimate-b1-test-book",
  }),
  Object.freeze({
    bookSlug: "ultimate-b1-plus",
    bookTitle: "Ultimate English B1+",
    components: Object.freeze([
      Object.freeze({ componentSlug: "ultimate-b1-plus-students-book", componentTitle: "Students Book" }),
      Object.freeze({ componentSlug: "ultimate-b1-plus-workbook", componentTitle: "Workbook" }),
      Object.freeze({ componentSlug: "ultimate-b1-plus-grammar-book", componentTitle: "Grammar Book" }),
    ]),
    testBookSlug: "ultimate-b1-plus-test-book",
  }),
]);

export const emptyShellPageCatalogs = new Map(emptyShellPackages.flatMap((book) => book.components.map((component) => [
  `${book.bookSlug}/${component.componentSlug}`,
  Object.freeze({
    revision: 0,
    hotspotRevision: 0,
    component: Object.freeze({ bookSlug: book.bookSlug, componentSlug: component.componentSlug, kind: "managed", title: component.componentTitle }),
    units: Object.freeze(Array.from({ length: 10 }, (_, index) => Object.freeze({
      id: `${component.componentSlug}-unit-${index + 1}`,
      slug: `unit-${index + 1}`,
      title: `Unit ${index + 1}`,
      unitNumber: index + 1,
      sortOrder: index + 1,
    }))),
    pages: Object.freeze([]),
    deletedPages: Object.freeze([]),
  }),
])));

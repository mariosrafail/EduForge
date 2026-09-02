const input = [
  {
    bookSlug: "ultimate-b1",
    bookTitle: "Ultimate English B1",
    uiOwnerComponentSlug: "ultimate-b1-students-book",
    components: [
      ["ultimate-b1-students-book", "Students Book"],
      ["ultimate-b1-workbook", "Workbook"],
      ["ultimate-b1-grammar-book", "Grammar Book"],
    ],
  },
  {
    bookSlug: "ultimate-b1-plus",
    bookTitle: "Ultimate English B1+",
    uiOwnerComponentSlug: "ultimate-b1-plus-students-book",
    components: [
      ["ultimate-b1-plus-students-book", "Students Book"],
      ["ultimate-b1-plus-workbook", "Workbook"],
      ["ultimate-b1-plus-grammar-book", "Grammar Book"],
    ],
  },
  {
    bookSlug: "ultimate-b2",
    bookTitle: "Ultimate B2",
    uiOwnerComponentSlug: "ultimate-b2-students-book",
    components: [
      ["ultimate-b2-workbook", "Workbook"],
      ["ultimate-b2-grammar-book", "Grammar Book"],
    ],
  },
];

export const managedHostedPackages = Object.freeze(input.map((book) => Object.freeze({
  bookSlug: book.bookSlug,
  bookTitle: book.bookTitle,
  uiOwnerComponentSlug: book.uiOwnerComponentSlug,
  components: Object.freeze(book.components.map(([componentSlug, componentTitle]) => Object.freeze({
    bookSlug: book.bookSlug,
    bookTitle: book.bookTitle,
    componentSlug,
    componentTitle,
    uiOwnerComponentSlug: book.uiOwnerComponentSlug,
  }))),
})));

export const managedHostedComponents = Object.freeze(managedHostedPackages.flatMap((book) => book.components));

export function findManagedHostedPackage(bookSlug) {
  return managedHostedPackages.find((book) => book.bookSlug === bookSlug) || null;
}

export function findManagedHostedComponent(bookSlug, componentSlug) {
  return managedHostedComponents.find((component) => component.bookSlug === bookSlug && component.componentSlug === componentSlug) || null;
}

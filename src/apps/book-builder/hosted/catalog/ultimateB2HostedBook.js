import { findProductBook } from "../../../../data/bookProductCatalog.js";

export const ultimateB2HostedCovers = Object.freeze({
  studentsBook: new URL("../../../../assets/books/ultimate-b2/covers/ultimate_b2_students_book.jpg", import.meta.url).href,
  workbook: new URL("../../../../assets/books/ultimate-b2/covers/ultimate_b2_workbook.jpg", import.meta.url).href,
  grammarBook: new URL("../../../../assets/books/ultimate-b2/covers/ultimate_b2_grammar_book.jpg", import.meta.url).href,
  testBook: new URL("../../../../assets/books/ultimate-b2/covers/ultimate_b2_test_book.jpg", import.meta.url).href,
});

const coverBySlug = Object.freeze({
  "ultimate-b2-students-book": ultimateB2HostedCovers.studentsBook,
  "ultimate-b2-workbook": ultimateB2HostedCovers.workbook,
  "ultimate-b2-grammar-book": ultimateB2HostedCovers.grammarBook,
  "ultimate-b2-test-book": ultimateB2HostedCovers.testBook,
});

const product = findProductBook("ultimate-b2");

export const ultimateB2HostedBook = Object.freeze({
  ...product,
  status: "In authoring",
  cover: ultimateB2HostedCovers.studentsBook,
  components: Object.freeze(product.components.map((component) => Object.freeze({
    ...component,
    status: component.authoringState === "active" ? "In authoring" : "Authoring adapter pending",
    cover: coverBySlug[component.slug] || null,
    adapterId: component.authoringAdapterId,
  }))),
});

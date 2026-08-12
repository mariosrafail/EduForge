const covers = Object.freeze({
  studentsBook: new URL("../../../../assets/books/ultimate-b2/covers/ultimate_b2_students_book.jpg", import.meta.url).href,
  workbook: new URL("../../../../assets/books/ultimate-b2/covers/ultimate_b2_workbook.jpg", import.meta.url).href,
  grammarBook: new URL("../../../../assets/books/ultimate-b2/covers/ultimate_b2_grammar_book.jpg", import.meta.url).href,
  testBook: new URL("../../../../assets/books/ultimate-b2/covers/ultimate_b2_test_book.jpg", import.meta.url).href,
});

export const ultimateB2HostedBook = Object.freeze({
  id: "ultimate-b2",
  slug: "ultimate-b2",
  title: "Ultimate B2",
  level: "B2",
  publisher: "Hamilton House",
  status: "In authoring",
  cover: covers.studentsBook,
  components: Object.freeze([
    Object.freeze({
      id: "ultimate-b2-students-book",
      slug: "ultimate-b2-students-book",
      title: "Students Book",
      type: "students_book",
      status: "In authoring",
      cover: covers.studentsBook,
      adapterId: "ultimate-b2-students-book",
    }),
    Object.freeze({
      id: "ultimate-b2-workbook",
      slug: "ultimate-b2-workbook",
      title: "Workbook",
      type: "workbook",
      status: "Ready for authoring setup",
      cover: covers.workbook,
      adapterId: null,
    }),
    Object.freeze({
      id: "ultimate-b2-grammar-book",
      slug: "ultimate-b2-grammar-book",
      title: "Grammar Book",
      type: "grammar_book",
      status: "Ready for authoring setup",
      cover: covers.grammarBook,
      adapterId: null,
    }),
    Object.freeze({
      id: "ultimate-b2-test-book",
      slug: "ultimate-b2-test-book",
      title: "Test Book",
      type: "test_book",
      status: "Ready for authoring setup",
      cover: covers.testBook,
      adapterId: null,
    }),
  ]),
});

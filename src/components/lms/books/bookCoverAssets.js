import { ultimateB2StudentsBookCover } from "virtual:ultimate-b2-cover-assets";
import englishJourney6Cover from "../../../assets/books/english-journey-6/covers/english_journey_6_students_book.png";

const studentsBookCover = ultimateB2StudentsBookCover.localUrl;
const workbookCover = null;
const grammarBookCover = null;
const testBookCover = null;

export const coverAssets = {
  "students-book": studentsBookCover,
  students_book: studentsBookCover,
  "ultimate-b2-students-book": studentsBookCover,
  workbook: workbookCover,
  "ultimate-b2-workbook": workbookCover,
  "grammar-book": grammarBookCover,
  grammar_book: grammarBookCover,
  "ultimate-b2-grammar-book": grammarBookCover,
  "test-book": testBookCover,
  test_book: testBookCover,
  "ultimate-b2-test-book": testBookCover,
  "ej6-students-book": englishJourney6Cover,
  "english-journey-6-students-book": englishJourney6Cover,
  "ej6-workbook": englishJourney6Cover,
  "english-journey-6-workbook": englishJourney6Cover,
  "ej6-grammar-book": englishJourney6Cover,
  "english-journey-6-grammar-book": englishJourney6Cover,
  "ej6-test-book": englishJourney6Cover,
  "english-journey-6-test-book": englishJourney6Cover,
  "ej6-video-bank": englishJourney6Cover,
  "english-journey-6-video-bank": englishJourney6Cover,
};

export function resolveCoverAsset(component) {
  const lookupValues = [
    component.id,
    component.slug,
    component.componentType,
    component.component_type,
    component.coverAssetPath,
    component.cover_asset_path,
    component.title,
  ].map((value) => String(value || "").toLowerCase());

  if (lookupValues.some((value) => value.includes("english-journey-6") || value.includes("english journey 6") || value.includes("ej6"))) return englishJourney6Cover;
  if (lookupValues.some((value) => value.includes("students_book") || value.includes("students-book") || value.includes("students book"))) return studentsBookCover;
  if (lookupValues.some((value) => value.includes("workbook"))) return workbookCover;
  if (lookupValues.some((value) => value.includes("grammar"))) return grammarBookCover;
  if (lookupValues.some((value) => value.includes("test"))) return testBookCover;

  return coverAssets[component.id] || coverAssets[component.slug] || coverAssets[component.componentType] || null;
}

export function getCanonicalBookId(component) {
  const values = [component.id, component.slug, component.componentType, component.component_type, component.title]
    .map((value) => String(value || "").toLowerCase());

  if (values.some((value) => value.includes("english-journey-6") || value.includes("ej6"))) return component.slug || component.id;
  if (values.some((value) => value.includes("students_book") || value.includes("students-book") || value.includes("students book"))) return "students-book";
  if (values.some((value) => value.includes("workbook"))) return "workbook";
  if (values.some((value) => value.includes("grammar"))) return "grammar-book";
  if (values.some((value) => value.includes("test"))) return "test-book";
  if (values.some((value) => value.includes("video"))) return "video-bank";
  return component.slug || component.id;
}

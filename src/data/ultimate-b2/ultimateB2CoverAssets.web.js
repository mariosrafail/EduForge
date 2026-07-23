const protectedCover = (logicalKey) => ({
  logicalKey,
  localUrl: null,
  devFallbackUrl: import.meta.env.DEV
    ? `/.netlify/functions/ultimate-b2-source-asset?logicalKey=${encodeURIComponent(logicalKey)}`
    : null,
});

export const ultimateB2StudentsBookCover = protectedCover("ultimate-b2.students-book.cover");
export const ultimateB2CoverAssets = {
  "students-book": ultimateB2StudentsBookCover,
  workbook: protectedCover("ultimate-b2.workbook.cover"),
  "grammar-book": protectedCover("ultimate-b2.grammar-book.cover"),
  "test-book": protectedCover("ultimate-b2.test-book.cover"),
};

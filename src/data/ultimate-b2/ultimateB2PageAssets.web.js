const unit2LogicalKeys = {
  "19.png": "ultimate-b2.students-book.unit-2.page-19",
  "20-21.png": "ultimate-b2.students-book.unit-2.page-20-21",
  "22-23.png": "ultimate-b2.students-book.unit-2.page-22-23",
  "24-25.png": "ultimate-b2.students-book.unit-2.page-24-25",
  "26.png": "ultimate-b2.students-book.unit-2.page-26",
  "27.png": "ultimate-b2.students-book.unit-2.page-27",
  "28-29.png": "ultimate-b2.students-book.unit-2.page-28-29",
  "30.png": "ultimate-b2.students-book.unit-2.page-30",
  "31.png": "ultimate-b2.students-book.unit-2.page-31",
  "32.png": "ultimate-b2.students-book.unit-2.page-32",
  "33.png": "ultimate-b2.students-book.unit-2.page-33",
  "34.png": "ultimate-b2.students-book.unit-2.page-34",
};

export function getUltimateB2UnitPartNumbers() { return []; }
export function getUltimateB2UnitPartAsset() { return null; }
export function getUltimateB2Unit2Asset(fileName) {
  return { assetLogicalKey: unit2LogicalKeys[fileName], devFallbackUrl: import.meta.env.DEV ? `/selides/${fileName}` : null };
}

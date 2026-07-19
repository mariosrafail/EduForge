import studentsBookContent from "../../../books/ultimate-b2/generated/content/students-book-content.index.json";

const unit2LegacyNames = {
  "19.png": 1,
  "20-21.png": 2,
  "22-23.png": 3,
  "24-25.png": 4,
  "26.png": 5,
  "27.png": 6,
  "28-29.png": 7,
  "30.png": 8,
  "31.png": 9,
  "32.png": 10,
  "33.png": 11,
  "34.png": 12,
};

export function getUltimateB2UnitPartNumbers(unitNumber) {
  return studentsBookContent.units.find((unit) => unit.number === Number(unitNumber))?.pages.map((page) => page.partNumber) || [];
}

export function getUltimateB2UnitPartAsset(unitNumber, partNumber) {
  const page = studentsBookContent.units.find((unit) => unit.number === Number(unitNumber))?.pages.find((item) => item.partNumber === Number(partNumber));
  if (!page) return null;
  return {
    assetLogicalKey: page.pageImage.identity,
    devFallbackUrl: import.meta.env.DEV ? `/${page.pageImage.localHdAssetPath}` : null,
  };
}

export function getUltimateB2Unit2Asset(fileName) {
  return getUltimateB2UnitPartAsset(2, unit2LegacyNames[fileName]);
}

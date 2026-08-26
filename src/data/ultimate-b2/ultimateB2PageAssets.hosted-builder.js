import studentsBookContent from "./generated/students-book.runtime.json";

const publicRoot = "/page-library/ultimate-b2/ultimate-b2-students-book";
const unit2LegacyNames = Object.freeze({ "19.png": 1, "20-21.png": 2, "22-23.png": 3, "24-25.png": 4, "26.png": 5, "27.png": 6, "28-29.png": 7, "30.png": 8, "31.png": 9, "32.png": 10, "33.png": 11, "34.png": 12 });

function pageRecord(unitNumber, partNumber) {
  return studentsBookContent.units
    .find((unit) => Number(unit.number) === Number(unitNumber))?.pages
    .find((page) => Number(page.partNumber) === Number(partNumber));
}

export function getUltimateB2UnitPartNumbers(unitNumber) {
  return studentsBookContent.units
    .find((unit) => Number(unit.number) === Number(unitNumber))?.pages
    .map((page) => page.partNumber) || [];
}

export function getUltimateB2UnitPartAsset(unitNumber, partNumber) {
  const record = pageRecord(unitNumber, partNumber);
  if (!record) return null;
  const sourceExtension = record.pageImage.localHdAssetPath.match(/\.(png|jpe?g|webp)$/i)?.[1]?.toLowerCase();
  if (!sourceExtension) return null;
  return `${publicRoot}/${record.id}.${sourceExtension === "jpeg" ? "jpg" : sourceExtension}`;
}

export function getUltimateB2Unit2Asset(fileName) {
  return getUltimateB2UnitPartAsset(2, unit2LegacyNames[fileName]);
}

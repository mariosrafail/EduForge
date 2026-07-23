import unit1Part1 from "../../../unit/1/parts/HD/parts_part_1.png";
import unit1Part2 from "../../../unit/1/parts/HD/parts_part_2.png";
import unit1Part3 from "../../../unit/1/parts/HD/parts_part_3.png";
import unit1Part4 from "../../../unit/1/parts/HD/parts_part_4.png";
import unit1Part5 from "../../../unit/1/parts/HD/parts_part_5.png";
import unit1Part6 from "../../../unit/1/parts/HD/parts_part_6.png";
import unit1Part7 from "../../../unit/1/parts/HD/parts_part_7.png";
import unit1Part8 from "../../../unit/1/parts/HD/parts_part_8.png";
import unit1Part9 from "../../../unit/1/parts/HD/parts_part_9.png";
import unit1Part10 from "../../../unit/1/parts/HD/parts_part_10.png";
import unit2Part1 from "../../../unit/2/parts/HD/parts_part_1.png";
import unit2Part2 from "../../../unit/2/parts/HD/parts_part_2.png";
import unit2Part3 from "../../../unit/2/parts/HD/parts_part_3.png";
import unit2Part4 from "../../../unit/2/parts/HD/parts_part_4.png";
import unit2Part5 from "../../../unit/2/parts/HD/parts_part_5.png";
import unit2Part6 from "../../../unit/2/parts/HD/parts_part_6.png";
import unit2Part7 from "../../../unit/2/parts/HD/parts_part_7.png";
import unit2Part8 from "../../../unit/2/parts/HD/parts_part_8.png";
import unit2Part9 from "../../../unit/2/parts/HD/parts_part_9.png";
import unit2Part10 from "../../../unit/2/parts/HD/parts_part_10.png";
import unit2Part11 from "../../../unit/2/parts/HD/parts_part_11.png";
import unit2Part12 from "../../../unit/2/parts/HD/parts_part_12.png";

const unit2 = {
  "19.png": unit2Part1,
  "20-21.png": unit2Part2,
  "22-23.png": unit2Part3,
  "24-25.png": unit2Part4,
  "26.png": unit2Part5,
  "27.png": unit2Part6,
  "28-29.png": unit2Part7,
  "30.png": unit2Part8,
  "31.png": unit2Part9,
  "32.png": unit2Part10,
  "33.png": unit2Part11,
  "34.png": unit2Part12,
};
const unitAssets = {
  1: [unit1Part1, unit1Part2, unit1Part3, unit1Part4, unit1Part5, unit1Part6, unit1Part7, unit1Part8, unit1Part9, unit1Part10],
  2: [unit2Part1, unit2Part2, unit2Part3, unit2Part4, unit2Part5, unit2Part6, unit2Part7, unit2Part8, unit2Part9, unit2Part10, unit2Part11, unit2Part12],
};

export function getUltimateB2UnitPartNumbers(unitNumber) {
  return (unitAssets[unitNumber] || []).map((_, index) => index + 1);
}
export function getUltimateB2UnitPartAsset(unitNumber, partNumber) { return unitAssets[unitNumber]?.[partNumber - 1] || null; }
export function getUltimateB2Unit2Asset(fileName) { return unit2[fileName] || null; }

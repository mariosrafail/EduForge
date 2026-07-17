import page19Image from "../../../selides/19.png";
import page20To21Image from "../../../selides/20-21.png";
import page22To23Image from "../../../selides/22-23.png";
import page24To25Image from "../../../selides/24-25.png";
import page26Image from "../../../selides/26.png";
import page27Image from "../../../selides/27.png";
import page28To29Image from "../../../selides/28-29.png";
import page30Image from "../../../selides/30.png";
import page31Image from "../../../selides/31.png";
import page32Image from "../../../selides/32.png";
import page33Image from "../../../selides/33.png";
import page34Image from "../../../selides/34.png";

const unit2 = { "19.png": page19Image, "20-21.png": page20To21Image, "22-23.png": page22To23Image, "24-25.png": page24To25Image, "26.png": page26Image, "27.png": page27Image, "28-29.png": page28To29Image, "30.png": page30Image, "31.png": page31Image, "32.png": page32Image, "33.png": page33Image, "34.png": page34Image };
const unitAssets = import.meta.glob("../../../unit/*/parts/HD/parts_part_*.png", { eager: true, query: "?url", import: "default" });

export function getUltimateB2UnitPartNumbers(unitNumber) {
  return Object.keys(unitAssets).map((assetPath) => assetPath.match(new RegExp(`../../../unit/${unitNumber}/parts/HD/parts_part_(\\d+)\\.png$`))?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
}
export function getUltimateB2UnitPartAsset(unitNumber, partNumber) { return unitAssets[`../../../unit/${unitNumber}/parts/HD/parts_part_${partNumber}.png`] || null; }
export function getUltimateB2Unit2Asset(fileName) { return unit2[fileName] || null; }

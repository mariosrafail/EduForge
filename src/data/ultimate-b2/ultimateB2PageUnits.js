import studentsBookContent from "./generated/students-book.runtime.json";
import { getUltimateB2UnitPartAsset } from "virtual:ultimate-b2-page-assets";
import { buildStudentsBookPageUnits } from "./studentsBookReaderModel.js";

export const ultimateB2StudentsBookContent = studentsBookContent;

export const ultimateB2StudentsBookPageUnits = buildStudentsBookPageUnits(studentsBookContent, getUltimateB2UnitPartAsset);

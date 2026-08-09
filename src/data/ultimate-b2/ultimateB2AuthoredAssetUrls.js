import { ultimateB2TeacherAppAuthoring } from "./teacherAppAuthoring.js";

const classroomAssets = import.meta.glob("../../assets/books/ultimate-b2/legacy-classroom-ui/**/*.{png,jpg,jpeg,webp,gaf,mp3,wav}", { eager: true, query: "?url", import: "default" });
const studentsBookPartsBackground = import.meta.glob("../../assets/books/ultimate-b2/legacy-source/assets/books/book1/unit/2/parts/HD/parts_BG.png", { eager: true, query: "?url", import: "default" });
const authoredOverrides = import.meta.glob("../../assets/books/ultimate-b2/authoring/teacher-app/*.{png,jpg,jpeg,webp,gaf,mp3,wav}", { eager: true, query: "?url", import: "default" });
const pageAssets = import.meta.glob("../../../unit/{1,2}/parts/HD/*.{png,jpg,jpeg,webp}", { eager: true, query: "?url", import: "default" });
const allAssets = { ...classroomAssets, ...studentsBookPartsBackground, ...authoredOverrides, ...pageAssets };

function moduleKey(repositoryPath) {
  if (repositoryPath.startsWith("src/assets/")) return `../../assets/${repositoryPath.slice("src/assets/".length)}`;
  if (repositoryPath.startsWith("unit/")) return `../../../${repositoryPath}`;
  return "";
}

export function resolveUltimateB2AuthoredAssetUrl(bindingOrId) {
  const binding = typeof bindingOrId === "string" ? ultimateB2TeacherAppAuthoring.assets[bindingOrId] : bindingOrId;
  if (!binding) return null;
  return allAssets[moduleKey(binding.repositoryPath)] || null;
}

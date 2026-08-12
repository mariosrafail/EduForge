import { legacyClassroomAssets, ultimateB2TeacherToolbarItems } from "./legacyClassroomAssets.js";

export const hostedReviewClassroomBackground = legacyClassroomAssets.backgrounds.classroomGlacier;

export const hostedReviewToolbarItems = Object.freeze(ultimateB2TeacherToolbarItems.map((item) => Object.freeze({
  id: item.id,
  label: item.label,
  normal: item.normal,
})));

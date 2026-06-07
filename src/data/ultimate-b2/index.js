export { ultimateB2Package } from "./ultimateB2Package.js";
import { ultimateB2Package } from "./ultimateB2Package.js";

export const ultimateB2ComponentTitles = ultimateB2Package.components.map((component) => component.title);

export function findUltimateB2Exercise(identifier) {
  for (const component of ultimateB2Package.components) {
    for (const unit of component.units) {
      for (const lesson of unit.lessons) {
        const exercise = lesson.exercises.find((item) => item.id === identifier || item.demoActivityKey === identifier);
        if (exercise) {
          return { component, unit, lesson, exercise };
        }
      }
    }
  }
  return null;
}

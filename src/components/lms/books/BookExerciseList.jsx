import { Tag } from "../Shared.jsx";
import { TeacherExerciseRow } from "./BookExerciseRow.jsx";
import { isExerciseActive } from "./bookBrowserUtils.js";

export function TeacherBookUnitList({ component, onPreviewExercise, classOptions }) {
  return (
    <div className="teacher-book-unit-list">
      {component.units.map((unit) => (
        <section key={unit.id} className="teacher-book-unit">
          <div className="teacher-book-unit-header">
            <div>
              <span>{unit.unit}</span>
              <strong>{unit.title}</strong>
            </div>
            <Tag tone={unit.lessons.some((lesson) => lesson.exercises.some(isExerciseActive)) ? "green" : "slate"}>
              {unit.lessons.some((lesson) => lesson.exercises.some(isExerciseActive)) ? "Demo active" : "Locked"}
            </Tag>
          </div>
          <div className="teacher-book-unit-rows">
            {unit.lessons.flatMap((lesson) => lesson.exercises.map((exercise) => (
              <TeacherExerciseRow key={exercise.id} exercise={exercise} onPreviewExercise={onPreviewExercise} classOptions={classOptions} />
            )))}
          </div>
        </section>
      ))}
    </div>
  );
}

import { Tag } from "../Shared.jsx";
import { TeacherExerciseRow } from "./BookExerciseRow.jsx";
import { isExerciseActive } from "./bookBrowserUtils.js";

export function TeacherBookUnitList({ component, onPreviewExercise, classOptions, classes, currentUser }) {
  const units = component.teacherUnits?.length ? component.teacherUnits : component.units;

  return (
    <div className="teacher-book-unit-list">
      {units.map((unit) => {
        const exercises = unit.lessons.flatMap((lesson) => lesson.exercises || []);
        const activeCount = exercises.filter(isExerciseActive).length;
        const disabledCount = exercises.length - activeCount;
        return (
        <details key={unit.id} className="teacher-book-unit recovered-book-unit" open>
          <summary className="teacher-book-unit-header">
            <div>
              <span>{unit.unit}</span>
              <strong>{unit.title}</strong>
            </div>
            <div className="recovered-unit-counts">
              <Tag tone={activeCount ? "green" : "slate"}>{activeCount} activities</Tag>
              {disabledCount > 0 && <Tag tone="slate">{disabledCount} disabled</Tag>}
            </div>
          </summary>
          <div className="teacher-book-unit-rows">
            {unit.lessons.map((lesson) => (
              <section key={lesson.id} className="teacher-book-lesson-group" aria-labelledby={`${lesson.id}-heading`}>
                <div className="book-lesson-heading" id={`${lesson.id}-heading`}>
                  <strong>{lesson.title}</strong>
                  <small>{lesson.pageLabel || unit.unit}</small>
                </div>
                {lesson.exercises.map((exercise) => (
                  <TeacherExerciseRow
                    key={exercise.id}
                    exercise={exercise}
                    onPreviewExercise={onPreviewExercise}
                    classOptions={classOptions}
                    classes={classes}
                    currentUser={currentUser}
                  />
                ))}
              </section>
            ))}
          </div>
        </details>
        );
      })}
    </div>
  );
}

import { MonitorPlay } from "lucide-react";

export default function TeacherOfflineActivityList({ unit, onOpenActivity }) {
  if (!unit) return <section className="teacher-offline-empty">This unit is not installed.</section>;
  const count = unit.lessons.reduce((sum, lesson) => sum + lesson.exercises.length, 0);
  return (
    <section className="teacher-offline-contents">
      <header>
        <div>
          <span className="teacher-offline-eyebrow">Enabled classroom activities only</span>
          <h2>{unit.title} · Contents / Exercises</h2>
        </div>
        <strong>{count} activities</strong>
      </header>
      <div className="teacher-offline-lessons">
        {unit.lessons.map((lesson) => (
          <details key={lesson.id} open>
            <summary>
              <span>{lesson.title}</span>
              <small>{lesson.pageLabel} · {lesson.exercises.length} activities</small>
            </summary>
            <div>
              {lesson.exercises.map((exercise) => (
                <article key={exercise.stableActivityId}>
                  <div>
                    <strong>{exercise.title}</strong>
                    <p>{exercise.description}</p>
                    <small>{exercise.implementationModeLabel} · {exercise.pageLabel}</small>
                  </div>
                  <button type="button" className="teacher-primary-button" onClick={() => onOpenActivity(exercise.stableActivityId)}>
                    <MonitorPlay size={20} /> Present
                  </button>
                </article>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

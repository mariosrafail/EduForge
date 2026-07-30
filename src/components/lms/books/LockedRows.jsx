import { Lock } from "lucide-react";
import { Tag } from "../Shared.jsx";

export function LockedUnitRow({ unit }) {
  const lessonCount = unit.lessons.reduce((count, lesson) => count + lesson.exercises.length, 0);

  return (
    <article className="book-locked-unit" aria-disabled="true">
      <span><Lock size={17} /></span>
      <div>
        <strong>{unit.title}</strong>
        <p>{lessonCount} locked lesson{lessonCount === 1 ? "" : "s"} visible in the full digital book.</p>
      </div>
      <Tag tone="slate">Locked demo</Tag>
    </article>
  );
}

export function LockedExerciseRow({ exercise }) {
  return (
    <article className="book-exercise-row locked-exercise-row" aria-disabled="true">
      <div className="book-exercise-main">
        <strong>{exercise.title}</strong>
        <p>{exercise.description}</p>
        <div className="book-exercise-meta">
          <span>{exercise.skill}</span>
          <span>{exercise.type}</span>
          <span>{exercise.estimatedTime}</span>
        </div>
      </div>
      <div className="book-exercise-status">
        <Tag tone="slate">Locked</Tag>
        <small>{exercise.disabledReason || "Unavailable"}</small>
      </div>
      <button className="secondary-action compact-action" type="button" disabled>
        <Lock size={16} /> Locked
      </button>
    </article>
  );
}

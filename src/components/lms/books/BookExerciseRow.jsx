import { Copy, Eye, FileText, Lock, Play } from "lucide-react";
import { Tag } from "../Shared.jsx";
import { DisabledAssignControl, TeacherAssignControl } from "./TeacherAssignControl.jsx";
import { buildActivityHash, copyHashLink, exerciseActionLabel, isExerciseActive, statusTone } from "./bookBrowserUtils.js";

export function ActiveExerciseRow({ exercise, mode, onStartExercise, onPreviewExercise, classOptions, completedActivities = {} }) {
  const isTeacher = mode === "teacher";
  const completed = !isTeacher && completedActivities[exercise.demoActivityKey];
  const displayExercise = completed
    ? { ...exercise, status: "Submitted", studentProgressLabel: `Submitted / ${completed.score}%` }
    : exercise;
  const canStart = exercise.availableToStudent && typeof onStartExercise === "function";

  return (
    <article className="book-exercise-row active-demo-row">
      <div className="book-exercise-main">
        <strong>{exercise.title}</strong>
        <p>{exercise.description}</p>
        <div className="book-exercise-meta">
          <span>{displayExercise.skill}</span>
          <span>{displayExercise.type}</span>
          <span>{displayExercise.estimatedTime}</span>
        </div>
      </div>
      <div className="book-exercise-status">
        <Tag tone={statusTone(displayExercise.status)}>{displayExercise.status}</Tag>
        <small>{isTeacher ? displayExercise.progressLabel : displayExercise.studentProgressLabel}</small>
      </div>
      {isTeacher ? (
        <div className="book-browser-teacher-actions">
          <button
            className="secondary-action compact-action icon-only-action"
            type="button"
            aria-label={`Copy preview link for ${exercise.title}`}
            title="Copy preview link"
            onClick={() => copyHashLink(buildActivityHash(exercise.demoActivityKey, "teacher-preview"))}
            data-sound-click="tab"
          >
            <Copy size={15} />
          </button>
          <button className="secondary-action compact-action" type="button" onClick={() => onPreviewExercise?.(exercise)} data-sound-click="tab">
            <Eye size={16} /> Preview
          </button>
          {exercise.assignable ? <TeacherAssignControl exercise={exercise} classOptions={classOptions} /> : <Tag tone="slate">Not assignable</Tag>}
        </div>
      ) : (
        <button
          className="secondary-action compact-action"
          type="button"
          disabled={!canStart}
          onClick={() => onStartExercise?.(exercise)}
          data-sound-click="submit"
        >
          <Play size={16} /> {exerciseActionLabel(displayExercise)}
        </button>
      )}
    </article>
  );
}

export function TeacherExerciseRow({ exercise, onPreviewExercise, classOptions }) {
  const active = isExerciseActive(exercise);
  const Icon = active ? FileText : Lock;

  return (
    <article className={`teacher-book-exercise-row ${active ? "active" : "locked"}`}>
      <span className="teacher-book-exercise-icon"><Icon size={18} /></span>
      <div className="teacher-book-exercise-main">
        <strong>{exercise.title}</strong>
        <p>{exercise.description}</p>
        <div className="book-exercise-meta">
          <span>{exercise.skill}</span>
          <span>{exercise.type}</span>
          <span>{exercise.estimatedTime}</span>
        </div>
      </div>
      <div className="teacher-book-exercise-status">
        <Tag tone={active ? statusTone(exercise.status) : "slate"}>{active ? exercise.status : "Locked in demo"}</Tag>
        <small>{active ? exercise.progressLabel : "Publisher placeholder"}</small>
      </div>
      <div className="teacher-book-row-actions">
        <button
          className="secondary-action compact-action icon-only-action"
          type="button"
          disabled={!active}
          aria-label={`Copy preview link for ${exercise.title}`}
          title="Copy preview link"
          onClick={() => copyHashLink(buildActivityHash(exercise.demoActivityKey, "teacher-preview"))}
          data-sound-click="tab"
        >
          <Copy size={15} />
        </button>
        <button
          className="secondary-action compact-action teacher-preview-action"
          type="button"
          disabled={!active}
          onClick={() => onPreviewExercise?.(exercise)}
          data-sound-click="tab"
        >
          <Eye size={15} /> Preview
        </button>
        {active && exercise.assignable ? <TeacherAssignControl exercise={exercise} classOptions={classOptions} /> : <DisabledAssignControl />}
      </div>
    </article>
  );
}

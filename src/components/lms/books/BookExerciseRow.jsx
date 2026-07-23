import { Copy, Eye, FileText, Lock, MonitorPlay, Play } from "lucide-react";
import { Tag } from "../Shared.jsx";
import { DisabledAssignControl, TeacherAssignControl } from "./TeacherAssignControl.jsx";
import { buildActivityHash, copyHashLink, exerciseActionLabel, getExerciseActivityKey, isExerciseActive, statusTone } from "./bookBrowserUtils.js";

function ExerciseMetadata({ exercise }) {
  return (
    <div className="book-exercise-meta">
      {exercise.sectionTitle && <span>{exercise.sectionTitle}</span>}
      {exercise.type && <span>{exercise.type}</span>}
      {exercise.pageLabel && <span>{exercise.pageLabel}</span>}
      {exercise.implementationModeLabel && <span>{exercise.implementationModeLabel}</span>}
      {!exercise.pageLabel && exercise.estimatedTime && <span>{exercise.estimatedTime}</span>}
      {exercise.mediaDependencies?.length > 0 && <span>{exercise.mediaDependencies.length} media item{exercise.mediaDependencies.length === 1 ? "" : "s"}</span>}
    </div>
  );
}

export function ActiveExerciseRow({ exercise, mode, onStartExercise, onPreviewExercise, onPresentExercise, classOptions, classes, currentUser, completedActivities = {} }) {
  const isTeacher = mode === "teacher";
  const activityKey = getExerciseActivityKey(exercise);
  const completed = !isTeacher && completedActivities[activityKey];
  const displayExercise = completed
    ? {
        ...exercise,
        status: "Submitted",
        studentProgressLabel: Number.isFinite(completed.score) ? `Submitted / ${completed.score}%` : "Submitted",
      }
    : exercise;
  const canStart = exercise.availableToStudent && typeof onStartExercise === "function";

  return (
    <article className={`book-exercise-row ${exercise.stableActivityId ? "recovered-activity-row" : "active-demo-row"}`}>
      <div className="book-exercise-main">
        <strong>{exercise.title}</strong>
        <p>{exercise.description}</p>
        <ExerciseMetadata exercise={displayExercise} />
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
            onClick={() => copyHashLink(buildActivityHash(activityKey, "teacher-preview"))}
            data-sound-click="tab"
          >
            <Copy size={15} />
          </button>
          <button className="secondary-action compact-action" type="button" onClick={() => onPreviewExercise?.(exercise)} data-sound-click="tab">
            <Eye size={16} /> Preview
          </button>
          {onPresentExercise && (
            <button className="primary-action compact-action" type="button" onClick={() => onPresentExercise(exercise)} data-sound-click="submit">
              <MonitorPlay size={16} /> Present
            </button>
          )}
          {exercise.assignable
            ? <TeacherAssignControl exercise={exercise} classOptions={classOptions} classes={classes} currentUser={currentUser} />
            : <Tag tone="slate">Not assignable</Tag>}
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

export function TeacherExerciseRow({ exercise, onPreviewExercise, onPresentExercise, classOptions, classes, currentUser }) {
  const active = isExerciseActive(exercise);
  const activityKey = getExerciseActivityKey(exercise);
  const Icon = active ? FileText : Lock;

  return (
    <article className={`teacher-book-exercise-row ${active ? "active" : "locked"}`}>
      <span className="teacher-book-exercise-icon"><Icon size={18} /></span>
      <div className="teacher-book-exercise-main">
        <strong>{exercise.title}</strong>
        <p>{exercise.description}</p>
        <ExerciseMetadata exercise={exercise} />
      </div>
      <div className="teacher-book-exercise-status">
        <Tag tone={active ? statusTone(exercise.status) : "slate"}>{active ? exercise.status : exercise.status || "Unavailable"}</Tag>
        <small>{active ? exercise.progressLabel : exercise.disabledReason || "Unavailable"}</small>
      </div>
      <div className="teacher-book-row-actions">
        <button
          className="secondary-action compact-action icon-only-action"
          type="button"
          disabled={!active}
          aria-label={`Copy preview link for ${exercise.title}`}
          title="Copy preview link"
          onClick={() => copyHashLink(buildActivityHash(activityKey, "teacher-preview"))}
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
        {onPresentExercise && (
          <button
            className="primary-action compact-action teacher-present-action"
            type="button"
            disabled={!active}
            onClick={() => onPresentExercise(exercise)}
            data-sound-click="submit"
          >
            <MonitorPlay size={15} /> Present
          </button>
        )}
        {active && exercise.assignable
          ? <TeacherAssignControl exercise={exercise} classOptions={classOptions} classes={classes} currentUser={currentUser} />
          : <DisabledAssignControl label={exercise.disabledReason || "Not assignable"} />}
      </div>
    </article>
  );
}

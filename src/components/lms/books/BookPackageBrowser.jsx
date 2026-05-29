import { BookOpenCheck, Eye, Layers3, Play, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { ultimateB2Package } from "../../../data/ultimateB2DemoData.js";
import { Card, Tag } from "../Shared.jsx";

function statusTone(status) {
  if (status === "Completed" || status === "Available" || status === "Submitted") return "green";
  if (status === "Assigned") return "gold";
  return "blue";
}

function exerciseActionLabel(exercise) {
  if (exercise.status === "Completed") return "Review";
  if (exercise.status === "Submitted") return "Review";
  if (exercise.status === "Assigned") return "Continue";
  return "Start";
}

function BookCover({ component }) {
  return (
    <span className={`book-cover-placeholder cover-${component.coverTone || "orange"}`}>
      <b>{ultimateB2Package.level}</b>
      <strong>{component.title}</strong>
      <small>{component.type}</small>
      <em>{ultimateB2Package.demoSchool}</em>
    </span>
  );
}

function TeacherAssignControl({ exercise, classOptions }) {
  const [selectedClasses, setSelectedClasses] = useState([classOptions[0]]);
  const [message, setMessage] = useState("");

  const toggleClass = (className) => {
    setSelectedClasses((current) => (
      current.includes(className) ? current.filter((item) => item !== className) : [...current, className]
    ));
    setMessage("");
  };

  const assignExercise = () => {
    const targets = selectedClasses.length ? selectedClasses : [classOptions[0]];
    setSelectedClasses(targets);
    setMessage(`Exercise assigned to ${targets.join(", ")}.`);
  };

  return (
    <div className="book-browser-assign">
      <div className="book-browser-class-picker" aria-label={`Assign ${exercise.title} to classes`}>
        {classOptions.map((className) => (
          <label key={className}>
            <input type="checkbox" checked={selectedClasses.includes(className)} onChange={() => toggleClass(className)} />
            <span>{className}</span>
          </label>
        ))}
      </div>
      <button className="secondary-action compact-action" type="button" onClick={assignExercise} data-sound-click="submit">
        <Send size={16} /> Assign to
      </button>
      {message && <small className="book-browser-success">{message}</small>}
    </div>
  );
}

function ExerciseRow({ exercise, mode, onStartExercise, onPreviewExercise, classOptions, completedActivities = {} }) {
  const isTeacher = mode === "teacher";
  const completed = !isTeacher && completedActivities[exercise.demoActivityKey];
  const displayExercise = completed
    ? { ...exercise, status: "Submitted", studentProgressLabel: `Submitted / ${completed.score}%` }
    : exercise;
  const canStart = exercise.availableToStudent && typeof onStartExercise === "function";

  return (
    <article className="book-exercise-row">
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
          <button className="secondary-action compact-action" type="button" onClick={() => onPreviewExercise?.(exercise)} data-sound-click="tab">
            <Eye size={16} /> Preview
          </button>
          {exercise.assignable ? <TeacherAssignControl exercise={exercise} classOptions={classOptions} /> : <Tag tone="blue">Not assignable</Tag>}
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

function BookUnitPanel({ component, mode, onStartExercise, onPreviewExercise, classOptions, completedActivities }) {
  return (
    <Card className="book-unit-panel">
      <div className="card-heading">
        <div>
          <span className="eyebrow"><Layers3 size={15} /> {component.units[0]?.unit || "Unit 2"}</span>
          <h2>{component.title}</h2>
          <p>{component.subtitle}</p>
        </div>
        <Tag tone="blue">{mode === "teacher" ? "Assignable exercises" : "Practice exercises"}</Tag>
      </div>

      <div className="book-unit-list">
        {component.units.map((unit) => (
          <section key={unit.id}>
            <h3>{unit.title}</h3>
            {unit.lessons.map((lesson) => (
              <div key={lesson.id} className="book-lesson-block">
                <div className="book-lesson-heading">
                  <strong>{lesson.title}</strong>
                  <small>{unit.unit}</small>
                </div>
                <div className="book-exercise-list">
                  {lesson.exercises.map((exercise) => (
                    <ExerciseRow
                      key={exercise.id}
                      exercise={exercise}
                      mode={mode}
                      onStartExercise={onStartExercise}
                      onPreviewExercise={onPreviewExercise}
                      classOptions={classOptions}
                      completedActivities={completedActivities}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Card>
  );
}

export function BookPackageBrowser({
  mode = "student",
  onStartExercise,
  onPreviewExercise,
  completedActivities = {},
  classOptions = ultimateB2Package.classes,
}) {
  const [selectedComponentId, setSelectedComponentId] = useState(ultimateB2Package.components[0].id);
  const selectedComponent = useMemo(
    () => ultimateB2Package.components.find((component) => component.id === selectedComponentId) || ultimateB2Package.components[0],
    [selectedComponentId],
  );

  return (
    <section className={`book-package-browser ${mode === "teacher" ? "teacher-mode" : "student-mode"}`}>
      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow"><BookOpenCheck size={15} /> {ultimateB2Package.level}</span>
            <h2>{ultimateB2Package.packageLabel}</h2>
            <p>{ultimateB2Package.publisher} digital book package for {ultimateB2Package.demoSchool}.</p>
          </div>
          <Tag tone="green">B2 active</Tag>
        </div>

        <div className="book-component-grid">
          {ultimateB2Package.components.map((component) => (
            <button
              key={component.id}
              type="button"
              className={selectedComponent.id === component.id ? "selected" : ""}
              onClick={() => setSelectedComponentId(component.id)}
              data-sound-click="tab"
            >
              <BookCover component={component} />
              <span>
                <strong>{component.title}</strong>
                <small>{component.subtitle}</small>
              </span>
            </button>
          ))}
        </div>
      </Card>

      <BookUnitPanel
        component={selectedComponent}
        mode={mode}
        onStartExercise={onStartExercise}
        onPreviewExercise={onPreviewExercise}
        classOptions={classOptions}
        completedActivities={completedActivities}
      />
    </section>
  );
}

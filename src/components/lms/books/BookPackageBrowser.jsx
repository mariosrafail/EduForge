import { BookOpenCheck, Eye, Layers3, Play, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import grammarBookCover from "../../../assets/books/ultimate-b2/covers/ultimate_b2_grammar_book.jpg";
import studentsBookCover from "../../../assets/books/ultimate-b2/covers/ultimate_b2_students_book.jpg";
import testBookCover from "../../../assets/books/ultimate-b2/covers/ultimate_b2_test_book.jpg";
import workbookCover from "../../../assets/books/ultimate-b2/covers/ultimate_b2_workbook.jpg";
import { ultimateB2Package } from "../../../data/ultimateB2DemoData.js";
import { Card, Tag } from "../Shared.jsx";

const coverAssets = {
  "students-book": studentsBookCover,
  students_book: studentsBookCover,
  "ultimate-b2-students-book": studentsBookCover,
  workbook: workbookCover,
  "ultimate-b2-workbook": workbookCover,
  "grammar-book": grammarBookCover,
  grammar_book: grammarBookCover,
  "ultimate-b2-grammar-book": grammarBookCover,
  "test-book": testBookCover,
  test_book: testBookCover,
  "ultimate-b2-test-book": testBookCover,
};

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

function resolveCoverAsset(component) {
  const lookupValues = [
    component.id,
    component.slug,
    component.componentType,
    component.component_type,
    component.coverAssetPath,
    component.cover_asset_path,
    component.title,
  ].map((value) => String(value || "").toLowerCase());

  if (lookupValues.some((value) => value.includes("students_book") || value.includes("students-book") || value.includes("students book"))) return studentsBookCover;
  if (lookupValues.some((value) => value.includes("workbook"))) return workbookCover;
  if (lookupValues.some((value) => value.includes("grammar"))) return grammarBookCover;
  if (lookupValues.some((value) => value.includes("test"))) return testBookCover;

  return coverAssets[component.id] || coverAssets[component.slug] || coverAssets[component.componentType] || null;
}

function BookCover({ component, bookPackage }) {
  const coverAsset = resolveCoverAsset(component);
  if (coverAsset) {
    return (
      <span className="book-cover-placeholder book-cover-image">
        <img src={coverAsset} alt={`${component.title} cover`} loading="lazy" />
      </span>
    );
  }

  return (
    <span className={`book-cover-placeholder cover-${component.coverTone || "orange"}`}>
      <b>{bookPackage.level}</b>
      <strong>{component.title}</strong>
      <small>{component.type}</small>
      <em>{bookPackage.demoSchool}</em>
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
  bookPackage = ultimateB2Package,
}) {
  const activePackage = bookPackage?.components?.length ? bookPackage : ultimateB2Package;
  const [selectedComponentId, setSelectedComponentId] = useState(activePackage.components[0].id);
  const selectedComponent = useMemo(
    () => activePackage.components.find((component) => component.id === selectedComponentId) || activePackage.components[0],
    [activePackage, selectedComponentId],
  );

  useEffect(() => {
    if (!activePackage.components.some((component) => component.id === selectedComponentId)) {
      setSelectedComponentId(activePackage.components[0].id);
    }
  }, [activePackage, selectedComponentId]);

  return (
    <section className={`book-package-browser ${mode === "teacher" ? "teacher-mode" : "student-mode"}`}>
      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow"><BookOpenCheck size={15} /> {activePackage.level}</span>
            <h2>{activePackage.packageLabel}</h2>
            <p>{activePackage.publisher} digital book package for {activePackage.demoSchool}.</p>
          </div>
          <Tag tone="green">B2 active</Tag>
        </div>

        <div className="book-component-grid">
          {activePackage.components.map((component) => (
            <button
              key={component.id}
              type="button"
              className={selectedComponent.id === component.id ? "selected" : ""}
              onClick={() => setSelectedComponentId(component.id)}
              data-sound-click="tab"
            >
              <BookCover component={component} bookPackage={activePackage} />
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

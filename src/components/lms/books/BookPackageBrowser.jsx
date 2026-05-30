import { ArrowLeft, BookOpenCheck, CheckSquare, ChevronDown, Copy, Eye, FileText, Layers3, Lock, Play, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import grammarBookCover from "../../../assets/books/ultimate-b2/covers/ultimate_b2_grammar_book.jpg";
import studentsBookCover from "../../../assets/books/ultimate-b2/covers/ultimate_b2_students_book.jpg";
import testBookCover from "../../../assets/books/ultimate-b2/covers/ultimate_b2_test_book.jpg";
import workbookCover from "../../../assets/books/ultimate-b2/covers/ultimate_b2_workbook.jpg";
import { ultimateB2Package } from "../../../data/ultimateB2DemoData.js";
import { buildActivityHash, buildBookHash } from "../../../utils/hashRoutes.js";
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
  if (status === "Locked") return "slate";
  return "blue";
}

function exerciseActionLabel(exercise) {
  if (exercise.status === "Completed") return "Review";
  if (exercise.status === "Submitted") return "Review";
  if (exercise.status === "Assigned") return "Continue";
  return "Start";
}

function isExerciseActive(exercise) {
  return Boolean(exercise.demoActivityKey && !exercise.locked && (exercise.availableToStudent || exercise.assignable));
}

function getActiveExercises(component) {
  return component.units.flatMap((unit) => unit.lessons.flatMap((lesson) => lesson.exercises.filter(isExerciseActive)));
}

function copyHashLink(hash) {
  if (typeof window === "undefined") return;
  const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${hash}`;
  navigator.clipboard?.writeText(url).catch(() => {});
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

function getCanonicalBookId(component) {
  const values = [component.id, component.slug, component.componentType, component.component_type, component.title]
    .map((value) => String(value || "").toLowerCase());

  if (values.some((value) => value.includes("students_book") || value.includes("students-book") || value.includes("students book"))) return "students-book";
  if (values.some((value) => value.includes("workbook"))) return "workbook";
  if (values.some((value) => value.includes("grammar"))) return "grammar-book";
  if (values.some((value) => value.includes("test"))) return "test-book";
  return component.slug || component.id;
}

function isBookMatch(component, selectedBookId) {
  if (!selectedBookId) return false;
  return component.id === selectedBookId || component.slug === selectedBookId || getCanonicalBookId(component) === selectedBookId;
}

function BookCover({ component, bookPackage, size = "compact" }) {
  const coverAsset = resolveCoverAsset(component);
  if (coverAsset) {
    return (
      <span className={`book-cover-placeholder book-cover-image ${size === "large" ? "large-cover" : ""}`}>
        <img src={coverAsset} alt={`${component.title} cover`} loading="lazy" />
      </span>
    );
  }

  return (
    <span className={`book-cover-placeholder cover-${component.coverTone || "orange"} ${size === "large" ? "large-cover" : ""}`}>
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
  const [open, setOpen] = useState(false);

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
    setOpen(false);
  };

  return (
    <div className="teacher-assign-popover">
      <button
        className="teacher-assign-toggle"
        type="button"
        aria-expanded={open}
        aria-label={`Assign ${exercise.title} to class`}
        title="Assign to class"
        onClick={() => setOpen((current) => !current)}
        data-sound-click="tab"
      >
        <CheckSquare size={17} />
        <span>Assign</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="teacher-assign-menu" role="dialog" aria-label={`Choose classes for ${exercise.title}`}>
          <strong>Assign to class</strong>
          <div className="book-browser-class-picker">
            {classOptions.map((className) => (
              <label key={className}>
                <input type="checkbox" checked={selectedClasses.includes(className)} onChange={() => toggleClass(className)} />
                <span>{className}</span>
              </label>
            ))}
          </div>
          <button className="primary-action compact-action" type="button" onClick={assignExercise} data-sound-click="submit">
            <Send size={16} /> Assign
          </button>
        </div>
      )}
      {message && <small className="book-browser-success">{message}</small>}
    </div>
  );
}

function DisabledAssignControl() {
  return (
    <div className="teacher-assign-popover">
      <button className="teacher-assign-toggle disabled" type="button" disabled title="Not available in demo">
        <Lock size={16} />
        <span>Locked</span>
      </button>
      <small className="book-browser-muted">Not available in demo</small>
    </div>
  );
}

function LockedUnitRow({ unit }) {
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

function ActiveExerciseRow({ exercise, mode, onStartExercise, onPreviewExercise, classOptions, completedActivities = {} }) {
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

function LockedExerciseRow({ exercise }) {
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
        <small>{exercise.studentProgressLabel || "Locked for demo"}</small>
      </div>
      <button className="secondary-action compact-action" type="button" disabled>
        <Lock size={16} /> Locked
      </button>
    </article>
  );
}

function TeacherExerciseRow({ exercise, onPreviewExercise, classOptions }) {
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

function TeacherBookUnitList({ component, onPreviewExercise, classOptions }) {
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

function BookGrid({ bookPackage, mode, onSelectBook }) {
  const role = mode === "teacher" ? "teacher" : "student";

  return (
    <Card>
      <div className="card-heading">
        <div>
          <span className="eyebrow"><BookOpenCheck size={15} /> {bookPackage.level}</span>
          <h2>{bookPackage.packageLabel}</h2>
          <p>{bookPackage.publisher} digital book package for {bookPackage.demoSchool}.</p>
        </div>
        <Tag tone="green">B2 active</Tag>
      </div>

      <div className="book-component-grid book-card-grid">
        {bookPackage.components.map((component) => {
          const activeCount = getActiveExercises(component).length;
          const unitCount = component.units.length;
          const canonicalBookId = getCanonicalBookId(component);

          return (
            <article key={component.id} className="book-component-card">
              <button type="button" onClick={() => onSelectBook(component.id)} data-sound-click="tab">
                <BookCover component={component} bookPackage={bookPackage} size="large" />
                <span>
                  <strong>{component.title}</strong>
                  <small>{component.subtitle}</small>
                  <em>{unitCount} units / {activeCount} demo item{activeCount === 1 ? "" : "s"} active</em>
                </span>
              </button>
              <button
                className="book-card-copy-link"
                type="button"
                aria-label={`Copy direct link for ${component.title}`}
                title="Copy direct link"
                onClick={() => copyHashLink(buildBookHash(role, canonicalBookId))}
                data-sound-click="tab"
              >
                <Copy size={15} />
              </button>
            </article>
          );
        })}
      </div>
    </Card>
  );
}

function BookDetailView({ component, bookPackage, mode, onBack, onStartExercise, onPreviewExercise, classOptions, completedActivities }) {
  const activeCount = getActiveExercises(component).length;
  const role = mode === "teacher" ? "teacher" : "student";
  const canonicalBookId = getCanonicalBookId(component);

  return (
    <Card className="book-detail-view">
      <div className="book-detail-toolbar">
        <button className="secondary-action compact-action" type="button" onClick={onBack} data-sound-click="back">
          <ArrowLeft size={17} /> Back to all books
        </button>
        <button
          className="secondary-action compact-action"
          type="button"
          onClick={() => copyHashLink(buildBookHash(role, canonicalBookId))}
          data-sound-click="tab"
        >
          <Copy size={15} /> Copy book link
        </button>
        <Tag tone="blue">{mode === "teacher" ? "Teacher preview" : "Student view"}</Tag>
      </div>

      <div className="book-detail-hero">
        <BookCover component={component} bookPackage={bookPackage} size="large" />
        <div>
          <span className="eyebrow"><Layers3 size={15} /> {component.type}</span>
          <h2>{component.title}</h2>
          <p>{component.subtitle}</p>
          <div className="book-detail-stats">
            <span>{component.units.length} units visible</span>
            <span>{activeCount} demo item{activeCount === 1 ? "" : "s"} active</span>
            <span>Publisher content placeholders locked</span>
          </div>
        </div>
      </div>

      {mode === "teacher" ? (
        <TeacherBookUnitList component={component} onPreviewExercise={onPreviewExercise} classOptions={classOptions} />
      ) : (
        <div className="book-unit-list">
        {component.units.map((unit) => {
          const hasActiveExercises = unit.lessons.some((lesson) => lesson.exercises.some(isExerciseActive));

          if (!hasActiveExercises) {
            return <LockedUnitRow key={unit.id} unit={unit} />;
          }

          return (
            <section key={unit.id} className="book-active-unit">
              <div className="book-unit-heading">
                <div>
                  <h3>{unit.title}</h3>
                  <small>{unit.unit}</small>
                </div>
                <Tag tone="green">Demo active</Tag>
              </div>

              {unit.lessons.map((lesson) => (
                <div key={lesson.id} className="book-lesson-block">
                  <div className="book-lesson-heading">
                    <strong>{lesson.title}</strong>
                    <small>{unit.unit}</small>
                  </div>
                  <div className="book-exercise-list">
                    {lesson.exercises.map((exercise) => (
                      isExerciseActive(exercise) ? (
                        <ActiveExerciseRow
                          key={exercise.id}
                          exercise={exercise}
                          mode={mode}
                          onStartExercise={onStartExercise}
                          onPreviewExercise={onPreviewExercise}
                          classOptions={classOptions}
                          completedActivities={completedActivities}
                        />
                      ) : (
                        <LockedExerciseRow key={exercise.id} exercise={exercise} />
                      )
                    ))}
                  </div>
                </div>
              ))}
            </section>
          );
        })}
        </div>
      )}
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
  selectedComponentId: controlledSelectedComponentId,
  initialSelectedComponentId = null,
  onSelectComponent,
  onBackToBooks,
}) {
  const activePackage = bookPackage?.components?.length ? bookPackage : ultimateB2Package;
  const [uncontrolledSelectedComponentId, setUncontrolledSelectedComponentId] = useState(initialSelectedComponentId);
  const selectedComponentId = controlledSelectedComponentId !== undefined ? controlledSelectedComponentId : uncontrolledSelectedComponentId;
  const selectedComponent = useMemo(
    () => activePackage.components.find((component) => isBookMatch(component, selectedComponentId)) || null,
    [activePackage, selectedComponentId],
  );

  const selectComponent = (componentId) => {
    if (controlledSelectedComponentId === undefined) {
      setUncontrolledSelectedComponentId(componentId);
    }
    onSelectComponent?.(componentId);
  };

  const backToBooks = () => {
    if (controlledSelectedComponentId === undefined) {
      setUncontrolledSelectedComponentId(null);
    }
    onBackToBooks?.();
  };

  useEffect(() => {
    if (controlledSelectedComponentId !== undefined) return;
    setUncontrolledSelectedComponentId(initialSelectedComponentId);
  }, [controlledSelectedComponentId, initialSelectedComponentId]);

  useEffect(() => {
    if (selectedComponentId && !activePackage.components.some((component) => isBookMatch(component, selectedComponentId))) {
      selectComponent(null);
    }
  }, [activePackage, selectedComponentId]);

  return (
    <section className={`book-package-browser ${mode === "teacher" ? "teacher-mode" : "student-mode"}`}>
      {selectedComponent ? (
        <BookDetailView
          component={selectedComponent}
          bookPackage={activePackage}
          mode={mode}
          onBack={backToBooks}
          onStartExercise={onStartExercise}
          onPreviewExercise={onPreviewExercise}
          classOptions={classOptions}
          completedActivities={completedActivities}
        />
      ) : (
        <BookGrid
          bookPackage={activePackage}
          mode={mode}
          onSelectBook={(componentId) => {
            const component = activePackage.components.find((item) => item.id === componentId);
            selectComponent(component ? getCanonicalBookId(component) : componentId);
          }}
        />
      )}
    </section>
  );
}

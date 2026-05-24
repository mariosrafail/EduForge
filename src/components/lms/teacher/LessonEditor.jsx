import { useRef } from "react";
import { BookOpenText } from "lucide-react";

export function LessonEditor({ course, onChange }) {
  const lesson = course.lesson;
  const objectiveRowIds = useRef([]);
  const nextObjectiveRowId = useRef(0);

  const ensureObjectiveRowIds = () => {
    const objectiveCount = lesson.objectives?.length || 0;
    while (objectiveRowIds.current.length < objectiveCount) {
      objectiveRowIds.current.push(`lesson-objective-row-${lesson.id}-${nextObjectiveRowId.current}`);
      nextObjectiveRowId.current += 1;
    }
    if (objectiveRowIds.current.length > objectiveCount) {
      objectiveRowIds.current.length = objectiveCount;
    }
    return objectiveRowIds.current;
  };

  const updateLesson = (field, value) => {
    onChange({ ...course, lesson: { ...lesson, [field]: value } });
  };

  const updateObjective = (index, value) => {
    const objectives = lesson.objectives.map((objective, itemIndex) => (itemIndex === index ? value : objective));
    updateLesson("objectives", objectives);
  };

  const objectiveIds = ensureObjectiveRowIds();

  return (
    <section className="lesson-editor-panel">
      <div className="editor-section-heading">
        <BookOpenText size={19} />
        <div>
          <strong>Lesson details</strong>
          <span>Course, title, objectives, and student-facing context.</span>
        </div>
      </div>
      <div className="editor-field-grid">
        <label>
          Course / book
          <input value={course.title} onChange={(event) => onChange({ ...course, title: event.target.value })} />
        </label>
        <label>
          Course subtitle
          <input value={course.subtitle || ""} onChange={(event) => onChange({ ...course, subtitle: event.target.value })} />
        </label>
        <label>
          Book code
          <input value={course.book_code || course.bookCode || ""} onChange={(event) => onChange({ ...course, book_code: event.target.value, bookCode: event.target.value })} />
        </label>
        <label>
          Level
          <input value={course.level || ""} onChange={(event) => onChange({ ...course, level: event.target.value })} />
        </label>
        <label>
          Lesson title
          <input value={lesson.title} onChange={(event) => updateLesson("title", event.target.value)} />
        </label>
        <label>
          Lesson instructions
          <input value={lesson.instructions || ""} onChange={(event) => updateLesson("instructions", event.target.value)} />
        </label>
        <label>
          Unit
          <input value={lesson.unit} onChange={(event) => updateLesson("unit", event.target.value)} />
        </label>
        <label>
          Section
          <input value={lesson.section} onChange={(event) => updateLesson("section", event.target.value)} />
        </label>
        <label>
          Estimated time
          <input value={lesson.estimatedTime} onChange={(event) => updateLesson("estimatedTime", event.target.value)} />
        </label>
        <label>
          Class
          <input value={course.className} onChange={(event) => onChange({ ...course, className: event.target.value })} />
        </label>
      </div>
      <div className="objective-editor">
        <strong>Learning objectives</strong>
        {lesson.objectives.map((objective, index) => (
          <label key={objectiveIds[index]}>
            Objective {index + 1}
            <textarea value={objective} onChange={(event) => updateObjective(index, event.target.value)} />
          </label>
        ))}
      </div>
    </section>
  );
}

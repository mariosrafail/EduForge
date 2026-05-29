import { useRef } from "react";
import { BookOpenText, ListPlus, Trash2 } from "lucide-react";

const levelOptions = ["Primary (Pre-A1)", "A1", "A2", "B1", "B1+", "B2", "C1", "C2"];
const minuteOptions = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60];

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
    const objectives = (lesson.objectives || []).map((objective, itemIndex) => (itemIndex === index ? value : objective));
    updateLesson("objectives", objectives);
  };

  const addObjective = () => {
    objectiveRowIds.current.push(`lesson-objective-row-${lesson.id}-${nextObjectiveRowId.current}`);
    nextObjectiveRowId.current += 1;
    updateLesson("objectives", [...(lesson.objectives || []), "New learning objective"]);
  };

  const removeObjective = (index) => {
    objectiveRowIds.current.splice(index, 1);
    updateLesson("objectives", (lesson.objectives || []).filter((_, itemIndex) => itemIndex !== index));
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
          <select value={course.level || "B2"} onChange={(event) => onChange({ ...course, level: event.target.value })}>
            {levelOptions.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
        <label>
          Lesson title
          <input value={lesson.title} onChange={(event) => updateLesson("title", event.target.value)} />
        </label>
        <label className="lesson-instructions-field">
          Lesson instructions
          <textarea
            value={lesson.instructions || ""}
            placeholder="Write the instructions students will see before starting this lesson."
            onChange={(event) => updateLesson("instructions", event.target.value)}
          />
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
          <select value={lesson.estimatedTime || "20 minutes"} onChange={(event) => updateLesson("estimatedTime", event.target.value)}>
            {minuteOptions.map((minutes) => <option key={minutes} value={`${minutes} minutes`}>{minutes} minutes</option>)}
          </select>
        </label>
        <label>
          Class
          <input value={course.className} onChange={(event) => onChange({ ...course, className: event.target.value })} />
        </label>
      </div>
      <div className="objective-editor">
        <div className="line-editor-intro">
          <strong>Learning objectives</strong>
          <span>Add the goals students should achieve by the end of this lesson.</span>
        </div>
        {(lesson.objectives || []).map((objective, index) => (
          <div className="objective-editor-row" key={objectiveIds[index]}>
            <input
              aria-label={`Learning objective ${index + 1}`}
              value={objective}
              placeholder="Students can..."
              onChange={(event) => updateObjective(index, event.target.value)}
            />
            <button type="button" data-sound-click="deleteRemove" onClick={() => removeObjective(index)} aria-label={`Remove objective ${index + 1}`}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button type="button" className="secondary-action compact-action" onClick={addObjective}>
          <ListPlus size={16} /> Add objective
        </button>
      </div>
    </section>
  );
}

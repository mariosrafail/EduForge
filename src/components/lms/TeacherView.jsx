import { BarChart3, BookOpenCheck, FileUp, Plus, Send, Users } from "lucide-react";
import { useState } from "react";
import { assignments, bookUnits, books, classes, demoStudents, exerciseTypes, skillStats, submittedWork } from "../../data/lmsDemoData.js";
import { activityTypeLabels } from "../../services/activitiesApi.js";
import { ActivityBuilder } from "./ActivityBuilder.jsx";
import { SubmissionReview } from "./SubmissionReview.jsx";
import { Card, ExportButton, MetricCard, Progress, SectionTitle, Tag } from "./Shared.jsx";

export function TeacherView({ activityDemo, activityActions }) {
  const [selectedClass, setSelectedClass] = useState(classes[0].name);
  const [published, setPublished] = useState(false);
  const [exerciseCreated, setExerciseCreated] = useState(false);
  const [submissionReceived, setSubmissionReceived] = useState(false);
  const [assignmentList, setAssignmentList] = useState(assignments);
  const [builder, setBuilder] = useState({
    book: books[0],
    unit: bookUnits[0].unit,
    exerciseType: "Mixed test",
    targetMode: "Class",
    target: classes[0].name,
    due: "2026-05-29",
    attempts: "2",
  });
  const updateBuilder = (field, value) => {
    const next = { ...builder, [field]: value };
    if (field === "targetMode") {
      next.target = value === "Class" ? selectedClass : demoStudents[0];
    }
    setBuilder(next);
  };

  const publishAssignment = () => {
    const unitTitle = bookUnits.find((unit) => unit.unit === builder.unit)?.title ?? "Book unit";
    const target = builder.targetMode === "Class" ? builder.target : builder.target;
    const newAssignment = {
      title: `${builder.unit} ${builder.exerciseType}`,
      type: builder.exerciseType,
      target,
      due: builder.due,
      submitted: 0,
      total: builder.targetMode === "Class" ? classes.find((item) => item.name === target)?.students ?? 1 : 1,
      newlyPublished: true,
      meta: `${builder.book} / ${unitTitle} / ${builder.attempts} attempts`,
    };
    setAssignmentList([newAssignment, ...assignmentList]);
    setPublished(true);
    setExerciseCreated(true);
  };

  return (
    <div className="workspace">
      <SectionTitle
        eyebrow="Teacher supervision"
        title="Assign book-based practice, review submissions, and export adoption evidence."
        text="Teachers see class progress, select an Ultimate B2 class, assign publisher-controlled book units, inspect student results, run skill gap analysis, and author interactive activities."
        action={<ExportButton rows={submittedWork} />}
      />

      <section className="metric-grid four">
        <MetricCard label="Classes" value="3" note="2 active today" icon={Users} />
        <MetricCard label="Pending reviews" value="12" note="4 writing tasks" icon={BookOpenCheck} delay={1} />
        <MetricCard label="Auto-scored" value="86%" note="reading and grammar" icon={BarChart3} delay={2} />
        <MetricCard label="Exports" value="CSV" note="sample download ready" icon={FileUp} delay={3} />
      </section>

      <section className="teacher-grid">
        <Card className="priority-panel">
          <div className="card-heading">
            <div><span className="eyebrow">Class selector</span><h2>Classes</h2></div>
            <button className="secondary-action" onClick={() => setExerciseCreated(true)}><Plus size={17} /> New assignment</button>
          </div>
          <div className="class-list selectable">
            {classes.map((item) => (
              <article key={item.name} className={selectedClass === item.name ? "selected" : ""} onClick={() => setSelectedClass(item.name)}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.students} students / {item.book}</span>
                </div>
                <Tag tone={selectedClass === item.name ? "green" : "blue"}>{selectedClass === item.name ? "Selected" : "Open"}</Tag>
              </article>
            ))}
          </div>
        </Card>

        <Card>
          <div className="card-heading">
            <div><span className="eyebrow">Assignments</span><h2>Assign to class or student</h2></div>
            <button className="primary-action" onClick={publishAssignment}><Send size={17} /> Publish</button>
          </div>
          {published && <div className="inline-status success">Assigned book exercise published to {builder.target}. Students receive a portal notification immediately.</div>}
          <div className="assignment-list">
            {activityDemo.assignments.map((item) => {
              const activity = activityDemo.activities.find((activityItem) => activityItem.id === item.activity_id);
              return (
                <article key={item.id} className="newly-published">
                  <div>
                    <strong>{activity?.title || "Interactive activity"}</strong>
                    <span>{activity ? activityTypeLabels[activity.type] : "Activity"} / {item.target_label} / due {item.due_date}</span>
                    <small>{activity?.book_title} / {activity?.unit_title} / {item.allowed_attempts} attempts</small>
                  </div>
                  <Progress value={activityDemo.submissions.some((submission) => submission.assignment_id === item.id) ? 100 : 0} color="linear-gradient(90deg, #f97316, #0b1f3a)" />
                  <b>New</b>
                </article>
              );
            })}
            {assignmentList.map((item, index) => (
              <article key={`${item.title}-${index}`} className={item.newlyPublished ? "newly-published" : ""}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.type} / {item.target} / due {item.due}</span>
                  {item.meta && <small>{item.meta}</small>}
                </div>
                <Progress value={Math.round((item.submitted / item.total) * 100)} color="linear-gradient(90deg, #175cd3, #0f766e)" />
                <b>{item.newlyPublished ? "New" : `${item.submitted}/${item.total}`}</b>
              </article>
            ))}
          </div>
        </Card>
      </section>

      <Card className="assignment-builder priority-panel">
        <div className="card-heading">
          <div>
            <span className="eyebrow"><Plus size={15} /> Assignment builder</span>
            <h2>Build from publisher book content</h2>
            <p>Select the book, unit, exercise type, recipient, deadline, and attempt policy before publishing.</p>
          </div>
          <Tag tone={exerciseCreated ? "green" : "blue"}>{exerciseCreated ? "Draft ready" : "Demo builder"}</Tag>
        </div>
        <div className="builder-grid">
          <label>
            Book
            <select value={builder.book} onChange={(event) => updateBuilder("book", event.target.value)}>
              {books.map((book) => <option key={book}>{book}</option>)}
            </select>
          </label>
          <label>
            Unit
            <select value={builder.unit} onChange={(event) => updateBuilder("unit", event.target.value)}>
              {bookUnits.map((unit) => <option key={unit.unit} value={unit.unit}>{unit.unit}: {unit.title}</option>)}
            </select>
          </label>
          <label>
            Exercise type
            <select value={builder.exerciseType} onChange={(event) => updateBuilder("exerciseType", event.target.value)}>
              <option>Mixed test</option>
              {exerciseTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label>
            Assign to
            <select value={builder.targetMode} onChange={(event) => updateBuilder("targetMode", event.target.value)}>
              <option>Class</option>
              <option>Individual student</option>
            </select>
          </label>
          <label>
            Target
            <select value={builder.target} onChange={(event) => updateBuilder("target", event.target.value)}>
              {(builder.targetMode === "Class" ? classes.map((item) => item.name) : demoStudents).map((target) => <option key={target}>{target}</option>)}
            </select>
          </label>
          <label>
            Due date
            <input type="date" value={builder.due} onChange={(event) => updateBuilder("due", event.target.value)} />
          </label>
          <label>
            Allowed attempts
            <select value={builder.attempts} onChange={(event) => updateBuilder("attempts", event.target.value)}>
              <option>1</option>
              <option>2</option>
              <option>3</option>
            </select>
          </label>
          <button className="primary-action" onClick={publishAssignment}><Send size={17} /> Publish assignment</button>
        </div>
      </Card>

      <ActivityBuilder
        onCreateActivity={activityActions.createActivity}
        onCreateAssignment={activityActions.createAssignment}
      />

      <section className="teacher-grid lower">
        <Card>
          <span className="eyebrow">Performance by skill</span>
          <h2>Skill gap analysis</h2>
          <div className="skill-panel">
            {skillStats.map((skill) => (
              <div key={skill.label}>
                <div><strong>{skill.label}</strong><span>{skill.value}%</span></div>
                <Progress value={skill.value} color={skill.accent} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="card-heading">
            <div><span className="eyebrow">Submitted work</span><h2>Mistakes and recommendations</h2></div>
            <button className="secondary-action" onClick={() => setSubmissionReceived(true)}><BookOpenCheck size={17} /> Simulate submission</button>
          </div>
          {submissionReceived && (
            <div className="new-submission-card">
              <Tag tone="green">New submission received</Tag>
              <strong>Anna Georgiou / Quiz 2: Timed test / 76%</strong>
              <p>Detected mistakes: Unit 2 sentence transformation, listening detail questions, weak text evidence.</p>
              <small>Recommended revision: Ultimate B2 Grammar Book Unit 2 Exercise 4 plus Workbook page 20 replay before next attempt.</small>
            </div>
          )}
          <div className="review-list">
            {submittedWork.map((work) => (
              <article key={work.student}>
                <strong>{work.student}<span>{work.score}</span></strong>
                <p>{work.mistakes}</p>
                <Tag tone="gold">{work.recommendation}</Tag>
              </article>
            ))}
          </div>
        </Card>

        <Card className="upload-panel">
          <span className="eyebrow">Custom exercise builder</span>
          <h2>Interactive activity authoring</h2>
          <div className="dropzone">
            <FileUp size={28} />
            <strong>Drop a worksheet, paste text, or build from a book unit</strong>
            <small>Hamilton House demo mode: interactive activity authoring for assigned book exercises, skill tagging, attempts, and student preview.</small>
          </div>
          <button className="secondary-action" onClick={() => setExerciseCreated(true)}><Plus size={17} /> Create demo exercise</button>
          {exerciseCreated && <div className="inline-status">Custom exercise draft created with scoring, attempt limits, and skill tagging.</div>}
        </Card>
      </section>

      <SubmissionReview submissions={activityDemo.submissions} />
    </div>
  );
}

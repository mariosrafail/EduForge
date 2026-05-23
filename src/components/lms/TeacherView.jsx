import { BarChart3, BookOpenCheck, FileUp, Plus, Send, Users } from "lucide-react";
import { useState } from "react";
import { assignments, classes, skillStats, submittedWork } from "../../data/lmsDemoData.js";
import { Card, ExportButton, MetricCard, Progress, SectionTitle, Tag } from "./Shared.jsx";

export function TeacherView() {
  const [selectedClass, setSelectedClass] = useState(classes[0].name);
  const [published, setPublished] = useState(false);
  const [exerciseCreated, setExerciseCreated] = useState(false);

  return (
    <div className="workspace">
      <SectionTitle
        eyebrow="Teacher supervision"
        title="Assign, review, correct, and export performance evidence."
        text="Teachers see class-level progress, select a class, assign exercises to groups or individuals, inspect mistakes, and prepare data for school reporting."
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
            <button className="primary-action" onClick={() => setPublished(true)}><Send size={17} /> Publish</button>
          </div>
          {published && <div className="inline-status success">Assignment published to {selectedClass}. Students receive a portal notification immediately.</div>}
          <div className="assignment-list">
            {assignments.map((item) => (
              <article key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.type} / {item.target} / due {item.due}</span>
                </div>
                <Progress value={Math.round((item.submitted / item.total) * 100)} color="linear-gradient(90deg, #175cd3, #0f766e)" />
                <b>{item.submitted}/{item.total}</b>
              </article>
            ))}
          </div>
        </Card>
      </section>

      <section className="teacher-grid lower">
        <Card>
          <span className="eyebrow">Performance by skill</span>
          <h2>Class analytics</h2>
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
          <span className="eyebrow">Submitted work</span>
          <h2>Mistakes and recommendations</h2>
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
          <h2>Upload or create an activity</h2>
          <div className="dropzone">
            <FileUp size={28} />
            <strong>Drop a worksheet, paste text, or build from a book unit</strong>
            <small>Demo mode: multiple choice, fill blanks, matching, short answer, writing, and listening comprehension.</small>
          </div>
          <button className="secondary-action" onClick={() => setExerciseCreated(true)}><Plus size={17} /> Create demo exercise</button>
          {exerciseCreated && <div className="inline-status">Custom exercise draft created with scoring, attempt limits, and skill tagging.</div>}
        </Card>
      </section>
    </div>
  );
}

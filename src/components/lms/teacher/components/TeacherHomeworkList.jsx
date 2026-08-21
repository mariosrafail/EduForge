import { ClipboardList, Pencil, Play } from "lucide-react";
import { Card, Tag } from "../../Shared.jsx";

function progressLabel(progress = {}) {
  if (!progress.expected) return "No active recipients";
  return `${progress.submitted}/${progress.expected} completed · ${progress.missing} missing`;
}

export function TeacherHomeworkList({ homeworks = [], loading = false, onOpenResults, onExportResults, onEdit }) {
  return (
    <Card>
      <div className="card-heading">
        <div><span className="eyebrow"><ClipboardList size={15} /> Homeworks</span><h2>Grouped class work</h2></div>
        <Tag tone="green">{homeworks.length} total</Tag>
      </div>
      {loading && <div className="teacher-loading-state">Loading Homeworks...</div>}
      {!loading && homeworks.length === 0 && <div className="teacher-loading-state">No Homeworks yet. Create one below.</div>}
      <div className="teacher-homework-list">
        {homeworks.map((homework) => (
          <article key={homework.id} className="teacher-homework-card">
            <header>
              <div>
                <strong>{homework.title}</strong>
                <small>{homework.classes.map((item) => item.name).join(", ") || "No classes"} · {homework.itemCount} activities</small>
                <small>Due {homework.dueAt ? new Date(homework.dueAt).toLocaleDateString() : "No due date"}</small>
              </div>
              <div className="homework-editor-actions">
                {homework.status !== "closed" && <button className="secondary-action compact-action" type="button" onClick={() => onEdit?.(homework)}><Pencil size={14} /> Edit</button>}
                <Tag tone={homework.status === "closed" ? "slate" : "green"}>{homework.status === "closed" ? "Closed" : "Assigned"}</Tag>
              </div>
            </header>
            <div className="homework-progress-summary">
              <strong>{progressLabel(homework.progress)}</strong>
              <span>{homework.progress.awaitingReview} awaiting review · {homework.progress.reviewed} reviewed</span>
              {homework.progress.completionPercent !== null && <span>{homework.progress.completionPercent}% complete</span>}
            </div>
            <ol className="teacher-homework-items">
              {homework.items.map((item) => (
                <li key={item.id}>
                  <div><strong>{item.title}</strong><small>{item.packageTitle || item.componentTitle} · {item.targetKind === "published_native" ? "Published native" : "Book activity"}</small></div>
                  <div className="homework-item-assignments">
                    {item.assignments.map((assignment) => (
                      <span key={assignment.id}>
                        <small>{assignment.className}: {assignment.submitted}/{assignment.total} submitted</small>
                        <button className="secondary-action compact-action" type="button" onClick={() => onOpenResults(assignment)}><Play size={14} /> Results</button>
                        <button className="secondary-action compact-action" type="button" onClick={() => onExportResults(assignment)}>CSV</button>
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
            <small className="homework-lifecycle-note">{homework.status === "closed" ? "Closed Homework is read-only." : homework.structureLocked ? "Learner work exists; activity order and classes are locked, while Homework details remain editable." : "Activities, order, classes, and Homework details can be edited until learner work exists."}</small>
          </article>
        ))}
      </div>
    </Card>
  );
}

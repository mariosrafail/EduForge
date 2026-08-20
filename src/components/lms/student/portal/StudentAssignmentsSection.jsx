import { ClipboardList, Layers3, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listStudentAssignments, listStudentHomeworks } from "../../../../services/assignmentsApi.js";
import { Card, SectionTitle, Tag } from "../../Shared.jsx";
import { deriveStudentAssignmentPresentation } from "./studentAssignmentPresentation.js";

function formatDueStatus(dueAt) {
  if (!dueAt) return "No due date";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "No due date";
  const diffDays = Math.ceil((due.getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays <= 7) return "This week";
  return due.toLocaleDateString();
}

export function normalizeStudentAssignment(assignment = {}) {
  const activity = assignment.activity || {};
  return {
    ...assignment,
    title: assignment.title || activity.title || "Untitled assignment",
    component: assignment.componentTitle || assignment.component || assignment.packageTitle || "Ultimate B2",
    className: assignment.className || "Individual",
    dueStatus: assignment.dueStatus || formatDueStatus(assignment.dueAt),
    estimatedTime: assignment.estimatedTime || (activity.estimatedMinutes ? `${activity.estimatedMinutes} min` : "Activity"),
    completionStatus: assignment.completionStatus || (assignment.submittedAt ? "Submitted" : "Not started"),
    activityId: activity.id || assignment.activityId,
    assignmentId: assignment.assignmentId || assignment.id,
    score: assignment.scorePercent === null || assignment.scorePercent === undefined ? null : assignment.scorePercent,
  };
}

function itemTone(item) {
  if (item.submissionStatus === "awaiting_review") return "gold";
  if (item.submissionId) return "green";
  if (item.status === "closed") return "slate";
  return "blue";
}

function HomeworkDetails({ homework, openActivity }) {
  return (
    <Card className="student-assignment-detail student-homework-detail">
      <Tag tone={homework.status === "closed" ? "slate" : "blue"}>{homework.status === "closed" ? "Closed" : formatDueStatus(homework.dueAt)}</Tag>
      <span className="eyebrow"><Layers3 size={15} /> Homework details</span>
      <h2>{homework.title}</h2>
      <div className="student-detail-grid">
        <div><strong>Classes</strong><span>{homework.classNames.join(", ") || "Assigned class"}</span></div>
        <div><strong>Activities</strong><span>{homework.itemCount}</span></div>
        <div><strong>Due</strong><span>{homework.dueAt ? new Date(homework.dueAt).toLocaleString() : "No due date"}</span></div>
        <div><strong>Progress</strong><span>{homework.progress.submitted}/{homework.progress.expected} completed</span></div>
      </div>
      {homework.teacherNotes && <div className="student-assignment-instructions"><strong>Teacher instructions</strong><p>{homework.teacherNotes}</p></div>}
      {homework.worksheetLinks.length > 0 && <div className="homework-resource-links"><strong>Resources</strong>{homework.worksheetLinks.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer">{link}</a>)}</div>}
      <div className="student-homework-progress" aria-label={`${homework.progress.submitted} of ${homework.progress.expected} Homework activities completed`}>
        <span style={{ width: `${homework.progress.completionPercent || 0}%` }} />
      </div>
      <ol className="student-homework-items">
        {[...homework.items].sort((left, right) => left.position - right.position).map((item) => (
          <li key={item.id}>
            <div><strong>{item.title}</strong><small>{item.packageTitle || item.componentTitle || "Assigned activity"}</small></div>
            <Tag tone={itemTone(item)}>{item.completionStatus}</Tag>
            <button className="primary-action compact-action" type="button" onClick={() => openActivity({ ...item, id: item.activityId }, "assignments")}>
              <Play size={16} /> {item.submissionId ? "View result" : "Open activity"}
            </button>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function StandaloneAssignmentDetails({ assignment, openActivity }) {
  const presentation = deriveStudentAssignmentPresentation(assignment);
  return (
    <Card className="student-assignment-detail">
      <Tag tone={presentation.tone}>{presentation.label}</Tag>
      <span className="eyebrow"><ClipboardList size={15} /> Standalone assignment</span>
      <h2>{assignment.title}</h2>
      <div className="student-detail-grid">
        <div><strong>Book/component</strong><span>{assignment.component}</span></div>
        <div><strong>Class</strong><span>{assignment.className}</span></div>
        <div><strong>Due status</strong><span>{assignment.dueStatus}</span></div>
        <div><strong>Completion</strong><span>{assignment.completionStatus}</span></div>
        {assignment.score !== null && <div><strong>Score</strong><span>{assignment.score}%</span></div>}
      </div>
      {assignment.teacherNotes && <p>{assignment.teacherNotes}</p>}
      {assignment.worksheetLinks?.length > 0 && <div className="homework-resource-links">{assignment.worksheetLinks.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer">{link}</a>)}</div>}
      {assignment.teacherFeedback && <div className="inline-status"><strong>Teacher feedback:</strong> {assignment.teacherFeedback}</div>}
      {presentation.key === "closed" ? <div className="inline-status">This assignment has been closed and is no longer available for submission.</div> : (
        <button className="primary-action" type="button" onClick={() => openActivity(assignment, "assignments")}><Play size={17} /> {presentation.action}</button>
      )}
    </Card>
  );
}

export function StudentAssignments({ openActivity, currentUser = null, refreshKey = 0, submitMessage = "" }) {
  const [homeworks, setHomeworks] = useState([]);
  const [standaloneAssignments, setStandaloneAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedKey, setSelectedKey] = useState("");

  useEffect(() => {
    if (!currentUser?.id) return;
    let mounted = true;
    setLoading(true);
    setError("");
    Promise.all([listStudentHomeworks(currentUser.id), listStudentAssignments(currentUser.id)])
      .then(([homeworkRows, assignmentRows]) => {
        if (!mounted) return;
        const standalone = assignmentRows.filter((assignment) => !assignment.homeworkId).map(normalizeStudentAssignment);
        setHomeworks(homeworkRows);
        setStandaloneAssignments(standalone);
        setSelectedKey((current) => current || (homeworkRows[0] ? `homework:${homeworkRows[0].id}` : standalone[0] ? `assignment:${standalone[0].assignmentId}` : ""));
      })
      .catch((loadError) => {
        if (!mounted) return;
        setHomeworks([]);
        setStandaloneAssignments([]);
        setError(loadError.message || "Homework could not be loaded.");
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [currentUser?.id, refreshKey]);

  const selected = useMemo(() => {
    if (selectedKey.startsWith("homework:")) return { kind: "homework", value: homeworks.find((item) => `homework:${item.id}` === selectedKey) };
    return { kind: "assignment", value: standaloneAssignments.find((item) => `assignment:${item.assignmentId}` === selectedKey) };
  }, [homeworks, selectedKey, standaloneAssignments]);

  if (!currentUser?.id) return <section className="student-section-stack"><SectionTitle eyebrow="Homework" title="Sign in needed." text="Sign in as a student to see Homework from your classes." /><Card><p>No student account is currently signed in.</p></Card></section>;

  return (
    <section className="student-section-stack">
      <SectionTitle eyebrow="Homework" title="Your assigned work" text="Complete each Homework activity in order. Every activity opens in the existing secure book runtime." />
      <div className="student-assignments-layout">
        <aside className="student-assignment-sidebar">
          <strong>Homeworks</strong>
          {loading && <small>Loading Homework...</small>}
          {error && <small>{error}</small>}
          {!loading && !homeworks.length && !standaloneAssignments.length && <small>No assigned work yet.</small>}
          {homeworks.map((homework) => <button key={homework.id} type="button" className={selectedKey === `homework:${homework.id}` ? "selected" : ""} onClick={() => setSelectedKey(`homework:${homework.id}`)}><span>{homework.title}</span><small>{homework.progress.submitted}/{homework.progress.expected} complete · {formatDueStatus(homework.dueAt)}</small></button>)}
          {standaloneAssignments.length > 0 && <strong>Standalone assignments</strong>}
          {standaloneAssignments.map((assignment) => <button key={assignment.assignmentId} type="button" className={selectedKey === `assignment:${assignment.assignmentId}` ? "selected" : ""} onClick={() => setSelectedKey(`assignment:${assignment.assignmentId}`)}><span>{assignment.title}</span><small>{deriveStudentAssignmentPresentation(assignment).label} · {assignment.dueStatus}</small></button>)}
        </aside>
        <div>
          {submitMessage && <div className="inline-status success">{submitMessage}</div>}
          {selected.kind === "homework" && selected.value && <HomeworkDetails homework={selected.value} openActivity={openActivity} />}
          {selected.kind === "assignment" && selected.value && <StandaloneAssignmentDetails assignment={selected.value} openActivity={openActivity} />}
          {!selected.value && !loading && <Card><p>No assigned work yet.</p></Card>}
        </div>
      </div>
    </section>
  );
}

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, Progress, Tag } from "../../Shared.jsx";

function latestLabel(student) {
  if (!student.latestSubmittedAt) return "No submissions";
  const score = student.latestScore === null ? student.latestStatus === "awaiting_review" ? "Awaiting review" : "Not scored" : `${student.latestScore}%`;
  return `${score} · ${new Date(student.latestSubmittedAt).toLocaleDateString()}`;
}

export function TeacherStudentProgressTable({ students = [], onSelectStudent }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return students.filter((student) => !normalized || `${student.name} ${student.email} ${student.className}`.toLowerCase().includes(normalized)).sort((left, right) => {
      if (sort === "average") return (right.averageScore ?? -1) - (left.averageScore ?? -1);
      if (sort === "completion") return right.completionRate - left.completionRate;
      if (sort === "missing") return right.missing - left.missing;
      return left.name.localeCompare(right.name);
    });
  }, [query, sort, students]);
  return (
    <Card>
      <div className="teacher-analytics-heading"><div><span className="eyebrow">Student progress</span><h2>Progress by student</h2></div><Tag tone="blue">{visible.length} shown</Tag></div>
      <div className="teacher-student-progress-controls">
        <label><Search size={15} /> Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, or class" /></label>
        <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Name</option><option value="average">Average score</option><option value="completion">Completion</option><option value="missing">Missing work</option></select></label>
      </div>
      <div className="teacher-student-table teacher-analytics-student-table">
        {!visible.length && <div className="teacher-loading-state">No students found for these filters.</div>}
        {visible.map((student) => (
          <article key={student.studentId}>
            <div><strong>{student.name}</strong><small>{student.email || "No email"}</small></div>
            <span>{student.className}</span>
            <div className="teacher-student-progress-cell"><Progress value={student.completionRate} /><small>{student.submitted}/{student.assigned} submitted · {student.completionRate}%</small></div>
            <strong>{student.averageScore === null ? "Not scored" : `${student.averageScore}%`}</strong>
            <span>{latestLabel(student)}</span>
            <div className="teacher-student-flags">
              {student.awaitingReview > 0 && <Tag tone="gold">{student.awaitingReview} awaiting</Tag>}
              {student.overdueMissing > 0 && <Tag tone="red">{student.overdueMissing} overdue</Tag>}
              {!student.awaitingReview && !student.overdueMissing && <Tag tone="green">On track</Tag>}
            </div>
            <button className="secondary-action compact-action" type="button" onClick={() => onSelectStudent?.(student)}>View results</button>
          </article>
        ))}
      </div>
    </Card>
  );
}

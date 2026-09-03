import { ArrowLeft, ChevronLeft, ChevronRight, Download, MessageSquareText, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { downloadAssignmentResultsCsv, getAssignmentResults, reviewSubmission } from "../../../../services/assignmentsApi.js";
import { buildTeacherSectionHash } from "../../../../utils/hashRoutes.js";
import { Card, Tag } from "../../Shared.jsx";
import { filterAssignmentResultRows, teacherReviewFilters, teacherScorePolicy } from "../assignmentReviewPresentation.js";
import { TeacherPerformancePanel } from "../analytics/TeacherPerformancePanel.jsx";
import { useTeacherGradeAnalytics } from "../analytics/useTeacherGradeAnalytics.js";

function scoreLabel(score) {
  return score === null || score === undefined ? "No score" : `${Math.round(Number(score))}%`;
}

function statusTone(row) {
  if (!row.submissionId) return "slate";
  return row.submissionStatus === "awaiting_review" ? "gold" : "green";
}

export function TeacherAssignmentReviewWorkspace({ assignmentId, currentUser, navigateTo }) {
  const analytics = useTeacherGradeAnalytics({ assignmentId });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await getAssignmentResults(assignmentId);
      setResults(payload);
      setSelectedStudentId((current) => current || payload.rows?.find((row) => row.submissionStatus === "awaiting_review")?.studentId || payload.rows?.[0]?.studentId || "");
    } catch (loadError) {
      setResults(null);
      setError(loadError.message || "Assignment results could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!assignmentId) return;
    load();
  }, [assignmentId]);

  const rows = results?.rows || [];
  const filteredRows = useMemo(() => filterAssignmentResultRows(rows, filter), [filter, rows]);
  const selectedRow = rows.find((row) => row.studentId === selectedStudentId) || filteredRows[0] || rows[0] || null;
  const selectedIndex = filteredRows.findIndex((row) => row.studentId === selectedRow?.studentId);
  const scorePolicy = teacherScorePolicy(selectedRow || {}, results?.assignment || {});

  useEffect(() => {
    if (!selectedRow) return;
    setFeedback(selectedRow.teacherFeedback || "");
    setScore(selectedRow.scorePercent ?? "");
    setSaveMessage("");
  }, [selectedRow?.studentId, selectedRow?.reviewedAt, selectedRow?.scorePercent, selectedRow?.teacherFeedback]);

  useEffect(() => {
    if (!filteredRows.length) return;
    if (!filteredRows.some((row) => row.studentId === selectedStudentId)) setSelectedStudentId(filteredRows[0].studentId);
  }, [filter, filteredRows, selectedStudentId]);

  const selectRelative = (offset) => {
    const next = filteredRows[selectedIndex + offset];
    if (next) setSelectedStudentId(next.studentId);
  };

  const saveReview = async () => {
    if (!selectedRow?.submissionId) return;
    setSaving(true);
    setSaveMessage("");
    try {
      const payload = {
        submissionId: selectedRow.submissionId,
        teacherFeedback: feedback,
      };
      if (scorePolicy.editable) payload.scorePercent = score === "" ? null : Number(score);
      await reviewSubmission(payload);
      setSaveMessage("Review saved.");
      await load();
      analytics.refresh();
    } catch (saveError) {
      setSaveMessage(saveError.message || "Review could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const summary = results?.summary || {};
  return (
    <section className="teacher-review-workspace">
      <button className="secondary-action compact-action" type="button" onClick={() => navigateTo(buildTeacherSectionHash("assignments"))}><ArrowLeft size={16} /> Back to assignments</button>
      {loading && <Card><p>Loading assignment review...</p></Card>}
      {!loading && error && <Card><h2>Assignment unavailable</h2><p>{error}</p></Card>}
      {!loading && results && (
        <>
          <Card className="teacher-review-header">
            <div><span className="eyebrow">Assignment review</span><h1>{results.assignment?.title}</h1><p>{results.assignment?.className} · {results.assignment?.componentTitle || results.assignment?.component}</p></div>
            <button className="secondary-action compact-action" type="button" onClick={() => downloadAssignmentResultsCsv(results)}><Download size={16} /> Export CSV</button>
          </Card>
          <section className="teacher-review-metrics" aria-label="Assignment summary">
            <Card><strong>{summary.submittedCount || 0}/{summary.totalStudents || 0}</strong><span>Submitted</span></Card>
            <Card><strong>{summary.awaitingReviewCount || 0}</strong><span>Awaiting review</span></Card>
            <Card><strong>{summary.reviewedCount || 0}</strong><span>Reviewed</span></Card>
            <Card><strong>{summary.autoScoredCount || 0}</strong><span>Auto-scored</span></Card>
            <Card><strong>{summary.missingCount || 0}</strong><span>Not submitted</span></Card>
            <Card><strong>{summary.averageScore == null ? "Unscored" : `${summary.averageScore}%`}</strong><span>Scored average</span></Card>
          </section>
          <TeacherPerformancePanel filters={analytics.filters} updateFilter={analytics.updateFilter} state={analytics.state} hideFilters />
          <div className="teacher-review-filter-row" role="tablist" aria-label="Filter submissions">
            {teacherReviewFilters.map((item) => <button key={item.id} type="button" className={filter === item.id ? "selected" : ""} onClick={() => setFilter(item.id)}>{item.label}</button>)}
          </div>
          <div className="teacher-review-layout">
            <Card className="teacher-review-queue">
              <strong>Students</strong>
              {!filteredRows.length && <p>No students match this filter.</p>}
              {filteredRows.map((row) => (
                <button key={row.studentId} type="button" className={selectedRow?.studentId === row.studentId ? "selected" : ""} onClick={() => setSelectedStudentId(row.studentId)}>
                  <span><strong>{row.studentName}</strong><small>{row.email || row.className}</small></span>
                  <Tag tone={statusTone(row)}>{row.status}</Tag>
                </button>
              ))}
            </Card>
            <Card className="teacher-review-submission">
              {selectedRow ? (
                <>
                  <div className="teacher-review-student-heading">
                    <div><span className="eyebrow">Student submission</span><h2>{selectedRow.studentName}</h2><p>{selectedRow.submittedAt ? `Submitted ${new Date(selectedRow.submittedAt).toLocaleString()}` : "No submission received"}</p></div>
                    <Tag tone={statusTone(selectedRow)}>{selectedRow.status}</Tag>
                  </div>
                  {selectedRow.submissionId ? (
                    <>
                      <div className="teacher-review-responses">
                        <strong>Responses</strong>
                        {(selectedRow.answerDetails || []).length ? selectedRow.answerDetails.map((answer, index) => (
                          <article key={answer.questionId || index}>
                            <span>{answer.prompt || `Response ${index + 1}`}</span>
                            <p>{answer.answer || "No response"}</p>
                            {answer.modelAnswers?.length ? <div className="teacher-review-model-answers">{answer.modelAnswers.map((modelAnswer, modelIndex) => <small key={modelIndex}><strong>Model answer {modelIndex + 1}:</strong> <span>{modelAnswer}</span></small>)}</div> : answer.acceptedAnswers?.length ? <div className="teacher-review-model-answers">{answer.acceptedAnswers.map((acceptedAnswer, answerIndex) => <small key={answerIndex}><strong>Accepted answer {answerIndex + 1}:</strong> <span>{acceptedAnswer}</span></small>)}</div> : answer.modelAnswer ? <small><strong>Protected model answer:</strong> {answer.modelAnswer}</small> : null}
                          </article>
                        )) : Object.values(selectedRow.answers || {}).map((answer, index) => <article key={index}><span>Response {index + 1}</span><p>{String(answer || "No response")}</p></article>)}
                        {!(selectedRow.answerDetails || []).length && !Object.keys(selectedRow.answers || {}).length && <p>No response text was stored.</p>}
                      </div>
                      <div className="teacher-review-editor">
                        <label>{scorePolicy.label}<input type="number" min="0" max="100" value={score} disabled={!scorePolicy.editable} required={scorePolicy.required} onChange={(event) => setScore(event.target.value)} /></label>
                        <label><span><MessageSquareText size={16} /> Student-visible feedback</span><textarea rows={5} maxLength={4000} value={feedback} onChange={(event) => setFeedback(event.target.value)} /></label>
                        <button className="primary-action" type="button" disabled={saving || (scorePolicy.required && score === "")} onClick={saveReview}><Save size={16} /> {saving ? "Saving..." : "Save review"}</button>
                        {saveMessage && <div className={`inline-status ${saveMessage === "Review saved." ? "success" : "error"}`}>{saveMessage}</div>}
                      </div>
                    </>
                  ) : <div className="teacher-loading-state">This student has not submitted work.</div>}
                  <div className="teacher-review-pagination">
                    <button className="secondary-action compact-action" type="button" disabled={selectedIndex <= 0} onClick={() => selectRelative(-1)}><ChevronLeft size={16} /> Previous</button>
                    <span>{selectedIndex >= 0 ? selectedIndex + 1 : 0} / {filteredRows.length}</span>
                    <button className="secondary-action compact-action" type="button" disabled={selectedIndex < 0 || selectedIndex >= filteredRows.length - 1} onClick={() => selectRelative(1)}>Next <ChevronRight size={16} /></button>
                  </div>
                </>
              ) : <p>No student results are available.</p>}
            </Card>
          </div>
        </>
      )}
    </section>
  );
}

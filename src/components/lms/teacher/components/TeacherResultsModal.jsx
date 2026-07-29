import { BookOpen, CheckCircle2, ListChecks, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { dedupeBookPackages, demoBookPackages, normalizeBookPackageKey } from "../../../../data/bookPackages.js";
import { findUltimateB2Exercise } from "../../../../data/ultimateB2DemoData.js";
import { getBookPackageTreeWithFallback } from "../../../../services/bookContentApi.js";
import {
  createAssignment,
  exportAssignmentResultsCsv,
  getAssignmentResults,
  listClassStudents,
  listTeacherAssignments,
  listTeacherStudents,
  reviewSubmission,
} from "../../../../services/assignmentsApi.js";
import { createTeacherClass } from "../../../../services/classApi.js";
import { buildActivityHash, buildBookHash, buildTeacherPresentationHash, buildTeacherSectionHash, slugifyRoute } from "../../../../utils/hashRoutes.js";
import { teacherBooksPresentation } from "../teacherBooksState.js";
import { UltimateB2ActivityRunner } from "../../activities/UltimateB2ActivityRunner.jsx";
import { BookPackageBrowser, BookSubpageNavigation, findBookComponentById } from "../../books/BookPackageBrowser.jsx";
import { Card, Progress, SectionTitle, Tag } from "../../Shared.jsx";
import { TeacherCourseEditor } from "../TeacherCourseEditor.jsx";
import { ClassInviteLink } from "../ClassInviteLink.jsx";
import { classBookOptions, classLevelOptions, teacherSections } from "../teacherPortalConfig.js";
import { dueDateLabel, dueDateTone } from "../teacherPortalUtils.js";


export function ResultsModal({ student, assignment, liveResults = null, currentUser = null, label = "Student results", onClose, onReviewSaved }) {
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const [scoreDrafts, setScoreDrafts] = useState({});
  const [savingFeedbackId, setSavingFeedbackId] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");

  useEffect(() => {
    if (!student && !assignment) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [assignment, onClose, student]);

  useEffect(() => {
    const drafts = {};
    const scores = {};
    for (const row of liveResults?.rows || []) {
      if (row.submissionId) drafts[row.submissionId] = row.teacherFeedback || "";
      if (row.submissionId) scores[row.submissionId] = row.scorePercent ?? "";
    }
    setFeedbackDrafts(drafts);
    setScoreDrafts(scores);
    setReviewMessage("");
  }, [liveResults]);

  if (!student && !assignment) return null;

  const title = liveResults?.assignment?.title || assignment?.title || student?.name;
  const averageScore = liveResults?.summary?.averageScore ?? assignment?.averageScore ?? null;
  const summary = assignment
    ? `${liveResults?.assignment?.className || assignment.className} / ${liveResults?.summary?.submittedCount ?? assignment.submitted}/${liveResults?.summary?.totalStudents ?? assignment.total} submitted / ${averageScore === null ? "Unscored" : `${averageScore}% average`}`
    : student?.className || "Student";
  const tag = assignment ? (liveResults ? "Live results" : "Results unavailable") : student?.className || "Student";

  return (
    <div
      className="results-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <Card className="results-modal" role="dialog" aria-modal="true" aria-labelledby="results-modal-title" onClick={(event) => event.stopPropagation()}>
        <button className="results-modal-close" type="button" onClick={onClose} aria-label="Close results"><X size={18} /></button>
        <div className="card-heading">
          <div>
            <span className="eyebrow"><CheckCircle2 size={15} /> {label}</span>
            <h2 id="results-modal-title">{title}</h2>
            <p>{summary}</p>
          </div>
          <Tag tone="gold">{tag}</Tag>
        </div>

        {assignment && liveResults ? (
          <>
            <section className="student-grade-summary">
              <article className="panel"><strong>{liveResults.summary?.totalStudents ?? 0}</strong><span>Total students</span></article>
              <article className="panel"><strong>{liveResults.summary?.submittedCount ?? 0}</strong><span>Submitted</span></article>
              <article className="panel"><strong>{liveResults.summary?.missingCount ?? 0}</strong><span>Missing</span></article>
              <article className="panel"><strong>{liveResults.summary?.averageScore == null ? "Unscored" : `${liveResults.summary.averageScore}%`}</strong><span>Average score</span></article>
            </section>
            {reviewMessage && <div className="inline-status success">{reviewMessage}</div>}
            <div className="review-list results-modal-list">
              {(liveResults.rows || []).map((row) => (
                <article key={row.studentId || row.email}>
                  <strong>{row.studentName}<span>{row.score === null || row.score === undefined ? "No score" : `${row.score}%`}</span></strong>
                  <p>{row.email || "No email"} / {row.submittedAt ? `Submitted ${new Date(row.submittedAt).toLocaleString()}` : "Missing submission"}</p>
                  <Tag tone={["Submitted", "Reviewed"].includes(row.status) ? "green" : "gold"}>{row.status}</Tag>
                  {row.submissionId ? (
                    <>
                      <div className="teacher-submission-answers">
                        <strong>Submitted response</strong>
                        {(row.answerDetails || []).length ? (row.answerDetails || []).map((answer, index) => (
                          <div key={answer.questionId || index}>
                            <span>{answer.prompt || `Response ${index + 1}`}</span>
                            <p>{answer.answer || "No response"}</p>
                          </div>
                        )) : Object.values(row.answers || {}).length ? Object.values(row.answers || {}).map((answer, index) => (
                          <div key={index}>
                            <span>{`Response ${index + 1}`}</span>
                            <p>{String(answer || "No response")}</p>
                          </div>
                        )) : <p>No response text was stored.</p>}
                      </div>
                      <label>
                        Score (0-100)
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={scoreDrafts[row.submissionId] ?? ""}
                          onChange={(event) => setScoreDrafts((current) => ({ ...current, [row.submissionId]: event.target.value }))}
                          required={row.submissionStatus === "awaiting_review"}
                        />
                      </label>
                      <label>
                        Teacher feedback
                        <textarea
                          rows={2}
                          value={feedbackDrafts[row.submissionId] || ""}
                          onChange={(event) => setFeedbackDrafts((current) => ({ ...current, [row.submissionId]: event.target.value }))}
                          placeholder="Short feedback note"
                        />
                        <button
                          className="secondary-action compact-action"
                          type="button"
                          disabled={savingFeedbackId === row.submissionId}
                          onClick={async () => {
                            if (!currentUser?.id) {
                              setReviewMessage("Sign in as a teacher before saving feedback.");
                              return;
                            }
                            setSavingFeedbackId(row.submissionId);
                            setReviewMessage("");
                            try {
                              await reviewSubmission({
                                submissionId: row.submissionId,
                                teacherId: currentUser.id,
                                teacherFeedback: feedbackDrafts[row.submissionId] || "",
                                scorePercent: scoreDrafts[row.submissionId] === "" ? null : Number(scoreDrafts[row.submissionId]),
                              });
                              setReviewMessage("Feedback saved.");
                              onReviewSaved?.();
                            } catch (error) {
                              setReviewMessage(error.message || "Feedback could not be saved.");
                            } finally {
                              setSavingFeedbackId("");
                            }
                          }}
                          data-sound-click="submit"
                        >
                          {savingFeedbackId === row.submissionId ? "Saving..." : "Save feedback"}
                        </button>
                      </label>
                    </>
                  ) : (
                    <p>Missing students are waiting for submission.</p>
                  )}
                </article>
              ))}
            </div>
          </>
        ) : assignment ? (
          <div className="review-list results-modal-list">
            <article><strong>Results are not loaded</strong><p>Live assignment results could not be loaded for this assignment.</p><Tag tone="gold">Unavailable</Tag></article>
          </div>
        ) : (
          <div className="answer-feedback-list results-modal-list">
            <article><strong>No detailed submission selected</strong><span>Open a live assignment result to review answers and feedback.</span></article>
          </div>
        )}
      </Card>
    </div>
  );
}

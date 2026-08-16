import { ArrowLeft, BookOpenCheck, CalendarClock, CheckCircle2, ClipboardList, MessageSquareText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listStudentAssignments, submitStudentAssignment } from "../../../../services/assignmentsApi.js";
import { buildStudentSectionHash } from "../../../../utils/hashRoutes.js";
import { UltimateB2ActivityRunner } from "../../activities/UltimateB2ActivityRunner.jsx";
import { PublishedNativeActivityRunner } from "../../activities/ultimate-b2/PublishedNativeActivityRunner.jsx";
import { BookPackageBrowser } from "../../books/BookPackageBrowser.jsx";
import { Card, Tag } from "../../Shared.jsx";
import { resolveStudentAssignmentBookContext } from "./studentAssignmentBookContext.js";
import { deriveStudentAssignmentPresentation } from "./studentAssignmentPresentation.js";

function formatDate(value) {
  if (!value) return "No due date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No due date" : date.toLocaleString();
}

function normalizeAssignment(assignment = {}) {
  const activity = assignment.activity || {};
  const nativeDocument = assignment.target?.entry?.document;
  return {
    ...assignment,
    assignmentId: assignment.assignmentId || assignment.id,
    activityId: activity.id || assignment.activityId,
    title: assignment.title || activity.title || "Untitled assignment",
    dbActivity: activity,
    demoActivityKey: assignment.target?.nativeActivityId || activity.stableActivityId || activity.demoActivityKey || activity.slug,
    pageId: nativeDocument?.placement?.pageId || assignment.pageId,
    packageSlug: assignment.target?.publication?.bookSlug || assignment.packageSlug,
    componentSlug: assignment.target?.publication?.componentSlug || assignment.componentSlug,
  };
}

function ResultPanel({ assignment, presentation }) {
  if (presentation.key === "not-started") return null;
  return (
    <Card className="student-assignment-result-panel">
      <span className="eyebrow"><CheckCircle2 size={15} /> Assignment result</span>
      <div className="student-assignment-result-heading">
        <div><h3>{presentation.label}</h3><p>{assignment.submittedAt ? `Submitted ${formatDate(assignment.submittedAt)}` : "This assignment is not open for submission."}</p></div>
        {presentation.score !== null && <strong>{Math.round(Number(presentation.score))}%</strong>}
      </div>
      {assignment.teacherFeedback && (
        <div className="student-assignment-feedback">
          <MessageSquareText size={18} />
          <div><strong>Teacher feedback</strong><p>{assignment.teacherFeedback}</p></div>
        </div>
      )}
    </Card>
  );
}

export function StudentAssignmentWorkspace({ assignmentId, currentUser, bookPackages = [], navigateTo, onAssignmentSubmitted }) {
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [selectedPage, setSelectedPage] = useState(null);
  const [nativeResponses, setNativeResponses] = useState({});

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listStudentAssignments(currentUser?.id);
      const match = rows.find((row) => String(row.assignmentId || row.id) === String(assignmentId));
      if (!match) throw new Error("This assignment is not available.");
      const normalized = normalizeAssignment(match);
      setAssignment(normalized);
      setNativeResponses(Object.fromEntries((normalized.responsePayload?.items || []).map((item) => [item.id, item.value])));
    } catch (loadError) {
      setAssignment(null);
      setError(loadError.message || "This assignment is not available.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser?.id || !assignmentId) {
      setLoading(false);
      setError("This assignment is not available.");
      return;
    }
    reload();
  }, [assignmentId, currentUser?.id]);

  const context = useMemo(() => assignment ? resolveStudentAssignmentBookContext(assignment) : null, [assignment]);
  const presentation = useMemo(() => assignment ? deriveStudentAssignmentPresentation(assignment) : null, [assignment]);
  const bookPackage = bookPackages.find((item) => (item.slug || item.id) === context?.packageSlug) || null;
  const activePage = selectedPage || context;
  const submitAssignedActivity = async (result) => {
    if (!presentation?.canSubmit) {
      throw new Error(assignment?.status === "closed"
        ? "This assignment has been closed and can no longer be submitted."
        : assignment?.submittedAt
        ? "This assignment has already been submitted. Practice here will not change the saved result."
        : "The deadline has passed. Practice here cannot be submitted for this assignment.");
    }
    setSubmitError("");
    setSubmitMessage("");
    try {
      const savedSubmission = await submitStudentAssignment({ assignmentId: assignment.assignmentId, activityId: assignment.activityId, score: result.score, result });
      setSubmitMessage("Assignment submission saved.");
      await reload();
      onAssignmentSubmitted?.();
      return savedSubmission;
    } catch (submitFailure) {
      setSubmitError(submitFailure.message || "Assignment submission could not be saved.");
      throw submitFailure;
    }
  };

  const submitNativeActivity = async () => {
    if (!presentation?.canSubmit) return;
    setSubmitError("");
    setSubmitMessage("");
    try {
      const questions = assignment.target?.entry?.document?.parts?.[0]?.interaction?.questions || [];
      await submitStudentAssignment({
        assignmentId: assignment.assignmentId,
        target: {
          kind: "published_native",
          releaseId: assignment.target.releaseId,
          nativeActivityId: assignment.target.nativeActivityId,
        },
        response: {
          schemaVersion: assignment.target.capability.responseSchemaVersion,
          items: questions.map((question) => ({ id: question.id, value: nativeResponses[question.id] || "" })),
        },
      });
      setSubmitMessage("Assignment submission saved.");
      await reload();
      onAssignmentSubmitted?.();
    } catch (submitFailure) {
      setSubmitError(submitFailure.message || "Assignment submission could not be saved.");
    }
  };

  useEffect(() => setSelectedPage(null), [assignmentId]);

  return (
    <section className="student-assignment-workspace">
      <button className="secondary-action compact-action student-assignment-back" type="button" onClick={() => navigateTo(buildStudentSectionHash("assignments"))}>
        <ArrowLeft size={16} /> Back to assignments
      </button>
      {loading && <Card><p>Loading assignment workspace...</p></Card>}
      {!loading && error && <Card className="student-assignment-unavailable"><h2>Assignment unavailable</h2><p>{error}</p></Card>}
      {!loading && assignment && context && presentation && (
        <>
          <Card className="student-assignment-workspace-header">
            <div>
              <span className="eyebrow"><ClipboardList size={15} /> {assignment.className || "Individual assignment"}</span>
              <h1>{assignment.title}</h1>
              <p>{assignment.packageTitle || "Ultimate B2"} · {assignment.componentTitle || context.catalog?.component?.title || "Students Book"} · {assignment.unitTitle || context.catalog?.unit?.title || "Book activity"}</p>
            </div>
            <Tag tone={presentation.tone}>{presentation.label}</Tag>
            <div className="student-assignment-workspace-meta">
              <span><CalendarClock size={16} /> Due {formatDate(assignment.dueAt)}</span>
              <span><BookOpenCheck size={16} /> {assignment.activity?.title || context.catalog?.exercise?.title || "Assigned activity"}</span>
            </div>
            {assignment.teacherNotes && <div className="student-assignment-instructions"><strong>Teacher instructions</strong><p>{assignment.teacherNotes}</p></div>}
          </Card>

          {bookPackage && context.pageId ? (
            <div className="student-assignment-book-panel">
              <div className="student-assignment-panel-label"><strong>Book page</strong><span>The assigned hotspot is highlighted. Other hotspots remain independent practice.</span></div>
              <BookPackageBrowser
                mode="student"
                bookPackage={bookPackage}
                selectedComponentId={context.componentId}
                selectedSubview="pages"
                selectedPageUnitId={activePage.unitId}
                selectedPageId={activePage.pageId}
                selectedPageNumber={activePage.pageNumber}
                highlightedActivityKey={context.activityKey}
                disableHighlightedActivityLaunch
                onSelectBookPage={(_componentId, unitId, pageId, pageNumber) => setSelectedPage({ unitId, pageId, pageNumber })}
                onSelectSubview={() => setSelectedPage(context)}
              />
            </div>
          ) : <Card><p>The book page is unavailable, but the assigned activity remains accessible below.</p></Card>}

          <Card className="student-assignment-activity-panel">
            <div className="student-assignment-panel-label"><strong>Assigned activity</strong><span>Only this activity submits against this assignment.</span></div>
            {!presentation.canSubmit && (
              <div className="inline-status">
                {assignment.status === "closed" && !assignment.submittedAt
                  ? "This assignment has been closed and can no longer be submitted."
                  : (assignment.submittedAt || assignment.submissionId)
                  ? "Your saved submission is read-only. You can revisit the activity for practice without changing the result."
                  : "The deadline has passed. You can view the activity for practice, but it cannot be submitted."}
              </div>
            )}
            {assignment.targetKind === "published_native" && assignment.target && (assignment.status !== "closed" || assignment.submissionId) && (
              <>
                <PublishedNativeActivityRunner
                  key={`${assignment.assignmentId}:${assignment.target.releaseId}`}
                  entry={assignment.target.entry}
                  publication={assignment.target.publication}
                  responses={nativeResponses}
                  onResponsesChange={setNativeResponses}
                  readOnly={!presentation.canSubmit}
                />
                {assignment.target.capability.submittable && presentation.canSubmit && (
                  <button className="primary-action" type="button" onClick={submitNativeActivity}>Submit assignment</button>
                )}
                {!assignment.target.capability.submittable && <div className="inline-status">This published activity is display-only and cannot be submitted.</div>}
              </>
            )}
            {assignment.targetKind !== "published_native" && (assignment.status !== "closed" || assignment.submissionId) && (
              <UltimateB2ActivityRunner
                key={assignment.assignmentId}
                activityKey={context.activityKey}
                exerciseId={context.catalog?.exercise?.id || assignment.activityId}
                activity={assignment.dbActivity}
                mode="student"
                hideBreadcrumb
                onSubmit={submitAssignedActivity}
                submission={assignment}
              />
            )}
            {submitMessage && <div className="inline-status success">{submitMessage}</div>}
            {submitError && <div className="inline-status error">{submitError}</div>}
          </Card>
          <ResultPanel assignment={assignment} presentation={presentation} />
        </>
      )}
    </section>
  );
}

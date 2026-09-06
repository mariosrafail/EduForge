import { ArrowLeft, BookOpenCheck, CalendarClock, CheckCircle2, ClipboardList, MessageSquareText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { submitStudentAssignment } from "../../../../services/assignmentsApi.js";
import { getStudentAssignment } from "../../../../services/publishedBooksApi.js";
import { PublishedBookSurface } from "../../books/PublishedBookSurface.jsx";
import { buildStudentSectionHash } from "../../../../utils/hashRoutes.js";
import { UltimateB2ActivityRunner } from "../../activities/UltimateB2ActivityRunner.jsx";
import { PublishedNativeStudentActivityRunner as PublishedNativeActivityRunner } from "../../activities/ultimate-b2/PublishedNativeStudentActivityRunner.jsx";
import { Card, Tag } from "../../Shared.jsx";
import { resolveStudentAssignmentBookContext } from "./studentAssignmentBookContext.js";
import { deriveStudentAssignmentPresentation } from "./studentAssignmentPresentation.js";
import { StudentInteractiveRuntimeShell } from "../runtime/StudentInteractiveRuntimeShell.jsx";
import { activityModeForStudentRuntime, STUDENT_RUNTIME_MODES } from "../runtime/studentRuntimeMode.js";
import { buildLegacyFinalSubmission, buildNativeFinalSubmission, restoreNativeSubmissionResponses, isDuplicateFinalSubmission } from "../runtime/studentSubmissionContract.js";

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
        {presentation.score !== null && <strong>{assignment.correctCount !== null && assignment.correctCount !== undefined && assignment.totalCount !== null && assignment.totalCount !== undefined ? `${assignment.correctCount}/${assignment.totalCount} · ` : ""}{Math.round(Number(presentation.score))}%</strong>}
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

export function StudentAssignmentWorkspace({ assignmentId, currentUser, navigateTo, onAssignmentSubmitted }) {
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [nativeResponses, setNativeResponses] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const pendingRead = useRef(null);
  const owner = `${currentUser?.id || ""}:${assignmentId || ""}`;
  const activeOwner = useRef(owner);
  activeOwner.current = owner;
  const [dirty, setDirty] = useState(false);

  const reload = useCallback(async () => {
    pendingRead.current?.abort();
    const controller = new AbortController();
    pendingRead.current = controller;
    setLoading(true);
    setError("");
    try {
      const match = await getStudentAssignment(assignmentId, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!match) throw new Error("This assignment is not available.");
      const normalized = normalizeAssignment(match);
      setAssignment({ ...normalized, workspaceOwner: owner });
      setNativeResponses(restoreNativeSubmissionResponses(normalized.responsePayload));
      setDirty(false);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setAssignment(null);
      setError(loadError.message || "This assignment is not available.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [assignmentId, currentUser?.id]);

  useEffect(() => {
    activeOwner.current = owner;
    if (!currentUser?.id || !assignmentId) {
      setAssignment(null);
      setLoading(false);
      setError("This assignment is not available.");
      return;
    }
    reload();
    setSubmitError("");
    setSubmitMessage("");
    setSubmitting(false);
    return () => { activeOwner.current = null; pendingRead.current?.abort(); };
  }, [assignmentId, currentUser?.id, reload]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const context = useMemo(() => assignment ? resolveStudentAssignmentBookContext(assignment) : null, [assignment]);
  const presentation = useMemo(() => assignment ? deriveStudentAssignmentPresentation(assignment) : null, [assignment]);
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
    setSubmitting(true);
    try {
      const savedSubmission = await submitStudentAssignment(buildLegacyFinalSubmission({ assignmentId: assignment.assignmentId, activityId: assignment.activityId, result }));
      if (activeOwner.current !== owner) return savedSubmission;
      setSubmitMessage("Assignment submission saved.");
      await reload();
      onAssignmentSubmitted?.();
      return savedSubmission;
    } catch (submitFailure) {
      if (activeOwner.current !== owner) throw submitFailure;
      if (isDuplicateFinalSubmission(submitFailure)) {
        await reload();
        setSubmitMessage("Your existing final submission was loaded and locked.");
        onAssignmentSubmitted?.();
        return true;
      }
      setSubmitError(submitFailure.message || "Assignment submission could not be saved.");
      throw submitFailure;
    } finally {
      if (activeOwner.current === owner) setSubmitting(false);
    }
  };

  const submitNativeActivity = async () => {
    if (!presentation?.canSubmit) return;
    setSubmitError("");
    setSubmitMessage("");
    setSubmitting(true);
    try {
      await submitStudentAssignment(buildNativeFinalSubmission({ assignmentId: assignment.assignmentId, target: assignment.target, responses: nativeResponses }));
      if (activeOwner.current !== owner) return true;
      setSubmitMessage("Assignment submission saved.");
      await reload();
      onAssignmentSubmitted?.();
      return true;
    } catch (submitFailure) {
      if (activeOwner.current !== owner) throw submitFailure;
      if (isDuplicateFinalSubmission(submitFailure)) {
        await reload();
        setSubmitMessage("Your existing final submission was loaded and locked.");
        onAssignmentSubmitted?.();
        return true;
      }
      setSubmitError(submitFailure.message || "Assignment submission could not be saved.");
      throw submitFailure;
    } finally {
      if (activeOwner.current === owner) setSubmitting(false);
    }
  };

  return (
    <section className="student-assignment-workspace">
      <button className="secondary-action compact-action student-assignment-back" type="button" onClick={() => { if (!dirty || window.confirm("Leave this assignment? Answers have not been submitted.")) navigateTo(buildStudentSectionHash("assignments")); }}>
        <ArrowLeft size={16} /> Back to assignments
      </button>
      {loading && <Card><p>Loading assignment workspace...</p></Card>}
      {!loading && error && <Card className="student-assignment-unavailable"><h2>Assignment unavailable</h2><p>{error}</p></Card>}
      {!loading && assignment?.workspaceOwner === owner && context && presentation && (
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

          <StudentInteractiveRuntimeShell
            mode={presentation.canSubmit ? STUDENT_RUNTIME_MODES.ASSIGNED : STUDENT_RUNTIME_MODES.REVIEW}
            title={assignment.activity?.title || context.catalog?.exercise?.title || assignment.title}
            context={[assignment.packageTitle || context.packageSlug, assignment.componentTitle || context.catalog?.component?.title, assignment.unitTitle || context.catalog?.unit?.title, context.pageNumber ? `Page ${context.pageNumber}` : "Activity-only view"]}
            statusLabel={presentation.label}
            statusTone={presentation.tone}
            submittable={assignment.targetKind === "published_native" ? Boolean(assignment.target?.capability?.submittable) : true}
            targetLoaded={assignment.targetKind !== "published_native" || Boolean(assignment.target?.entry)}
            supported={Boolean(context.activityKey || assignment.target?.entry)}
            closed={assignment.status === "closed"}
            expired={presentation.key === "overdue"}
            submitted={Boolean(assignment.submissionId || assignment.submittedAt)}
            lockedMessage={(assignment.submissionId || assignment.submittedAt) ? "Submitted and locked · This saved attempt is read-only." : assignment.status === "closed" ? "Closed and locked · This assignment can no longer be submitted." : "Deadline passed · This assignment is read-only."}
            pending={submitting}
            success={submitMessage}
            error={submitError}
            showSubmitAction={assignment.targetKind === "published_native"}
            onConfirmSubmit={assignment.targetKind === "published_native" ? submitNativeActivity : submitAssignedActivity}
          >
            {({ capabilities, requestFinalSubmit }) => (
              <>
                {!context.pageId ? <div className="student-runtime-fallback">The assigned page mapping is unavailable. The server-pinned activity is shown directly.</div> : null}
                {assignment.targetKind === "published_native" && assignment.target && assignment.book && context.pageId ? (
                  <PublishedBookSurface key={`${assignment.assignmentId}:${assignment.target.releaseId}`} book={assignment.book} mode="assigned"
                    initialLocator={{ pageId: context.pageId, hotspotId: context.hotspotId }} assignedTarget={assignment.target}
                    renderAssignedActivity={() => <PublishedNativeActivityRunner entry={assignment.target.entry} publication={assignment.target.publication}
                      responses={nativeResponses} onResponsesChange={(responses) => { setNativeResponses(responses); setDirty(true); }} readOnly={!capabilities.canEditResponses} />} />
                ) : assignment.targetKind === "published_native" && assignment.target ? (
                  <PublishedNativeActivityRunner
                    key={`${assignment.assignmentId}:${assignment.target.releaseId}`}
                    entry={assignment.target.entry}
                    publication={assignment.target.publication}
                    responses={nativeResponses}
                    onResponsesChange={(responses) => { setNativeResponses(responses); setDirty(true); }}
                    readOnly={!capabilities.canEditResponses}
                  />
                ) : null}
                {assignment.targetKind !== "published_native" && (assignment.status !== "closed" || assignment.submissionId) ? (
                  <UltimateB2ActivityRunner
                    key={assignment.assignmentId}
                    activityKey={context.activityKey}
                    exerciseId={context.catalog?.exercise?.id || assignment.activityId}
                    activity={assignment.dbActivity}
                    mode={activityModeForStudentRuntime(presentation.canSubmit ? STUDENT_RUNTIME_MODES.ASSIGNED : STUDENT_RUNTIME_MODES.REVIEW)}
                    hideBreadcrumb
                    onSubmit={requestFinalSubmit}
                    submission={assignment}
                    submitConfirmationOwner="runtime-shell"
                  />
                ) : null}
                {assignment.targetKind === "published_native" && !assignment.target?.capability?.submittable ? <div className="inline-status">This published activity is display-only and cannot be submitted.</div> : null}
              </>
            )}
          </StudentInteractiveRuntimeShell>
          <ResultPanel assignment={assignment} presentation={presentation} />
        </>
      )}
    </section>
  );
}

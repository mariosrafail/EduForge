import { useEffect, useRef, useState } from "react";

import {
  findStudentsBookImplementation,
  studentsBookImplementationModeLabels,
} from "../../../../data/ultimate-b2/studentsBookCatalog.js";
import { useBookAsset } from "../../../../hooks/useBookAsset.js";
import { getTeacherActivitySolutions } from "virtual:book-content-service";
import { getOfflineTeacherSolution } from "virtual:teacher-offline-solutions";
import { Card, Tag } from "../../Shared.jsx";
import { getActivityModeCapabilities } from "../activityModes.js";
import {
  checkPresentationAnswers,
  hidePresentationAnswers,
  resetPresentationAttempt,
  revealPresentationQuestion,
  verifiedSolutionQuestionIds,
} from "../presentationAnswers.js";
import { ultimateB2StudentsBookMedia } from "virtual:ultimate-b2-media-assets";
import { useExclusiveMediaPlayback } from "./shared/useExclusiveMediaPlayback.js";
import { isUltimateB2Unit1Part2LegacyPilot } from "../../../../data/ultimate-b2/unit1Part2LegacyPilotAssets.js";
import { UltimateB2LegacyPilotActivity } from "./UltimateB2LegacyPilotActivity.jsx";
import { isUltimateB2Unit1LegacyOpener } from "../../../../data/ultimate-b2/unit1Part1LegacyOpener.js";
import { UltimateB2LegacyUnitOpenerActivity } from "./UltimateB2LegacyUnitOpenerActivity.jsx";

export function findUnit2Implementation(id) {
  const activity = findStudentsBookImplementation(id);
  return activity?.unitNumber === 2 ? activity : null;
}

export function StudentsBookMediaPlayer({ logicalKey, type, className = "unit2-normalized-media" }) {
  const mediaRef = useRef(null);
  const announcePlayback = useExclusiveMediaPlayback(mediaRef);
  const [mediaError, setMediaError] = useState("");
  const offlineAsset = ultimateB2StudentsBookMedia[logicalKey] || null;
  const isOfflineApp = ["android-offline", "android-teacher-offline"].includes(import.meta.env.VITE_APP_MODE);
  const androidLocalUrl = isOfflineApp ? offlineAsset?.localUrl : null;
  const asset = useBookAsset(androidLocalUrl ? null : logicalKey, {
    devFallbackUrl: androidLocalUrl || (import.meta.env.DEV ? offlineAsset?.devFallbackUrl : null),
  });
  useEffect(() => {
    setMediaError("");
    const pauseWhenHidden = () => {
      if (document.hidden) mediaRef.current?.pause();
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      const mediaElement = mediaRef.current;
      if (!mediaElement) return;
      mediaElement.pause();
      mediaElement.removeAttribute("src");
      mediaElement.load();
    };
  }, [logicalKey]);
  if (asset.loading) return <div className="inline-status">Loading {type}…</div>;
  if (!asset.url) {
    return (
      <div className="inline-status error">
        This protected {type} is not available right now.
        <button className="secondary-action compact-action" type="button" onClick={asset.retry}>Try again</button>
      </div>
    );
  }
  const retryMedia = () => {
    setMediaError("");
    mediaRef.current?.load();
  };
  return (
    <>
      {type === "video"
        ? (
          <video
            ref={mediaRef}
            className={className}
            controls
            playsInline
            preload="metadata"
            src={asset.url}
            onPlay={announcePlayback}
            onError={() => setMediaError("This local video format could not be played on this device.")}
          />
        )
        : (
          <audio
            ref={mediaRef}
            className={className}
            controls
            preload="metadata"
            src={asset.url}
            onPlay={announcePlayback}
            onError={() => setMediaError("This local audio format could not be played on this device.")}
          />
        )}
      {mediaError && (
        <div className="inline-status error" role="alert">
          {mediaError}
          <button className="secondary-action compact-action" type="button" onClick={retryMedia}>Try again</button>
        </div>
      )}
    </>
  );
}

function responsePayload(activity, answers) {
  const payload = { ...answers };
  activity.runtime.questions.forEach((question, index) => { payload[String(index + 1)] = answers[question.id] || ""; });
  return payload;
}

export function NormalizedStudentsBookActivity({ activityId, mode = "student", onSubmit, submission = null }) {
  const activity = findStudentsBookImplementation(activityId);
  const capabilities = getActivityModeCapabilities(mode);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverResult, setServerResult] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const [solutions, setSolutions] = useState(null);
  const [solutionsLoading, setSolutionsLoading] = useState(false);
  const [solutionError, setSolutionError] = useState("");
  const [revealedQuestionIds, setRevealedQuestionIds] = useState([]);
  const [checkResults, setCheckResults] = useState({});
  const solutionRequest = useRef(null);
  const currentActivityId = useRef(activity?.stableNormalizedId || activityId);
  const presentationStateVersion = useRef(0);
  currentActivityId.current = activity?.stableNormalizedId || activityId;

  useEffect(() => {
    solutionRequest.current?.abort();
    solutionRequest.current = null;
    presentationStateVersion.current += 1;
    setAnswers({});
    setSubmitted(false);
    setCompleted(false);
    setSubmitting(false);
    setServerResult(null);
    setSubmitError("");
    setSolutions(null);
    setSolutionsLoading(false);
    setSolutionError("");
    setRevealedQuestionIds([]);
    setCheckResults({});
    return () => {
      solutionRequest.current?.abort();
      solutionRequest.current = null;
    };
  }, [activityId]);

  if (!activity) return <Card><div className="inline-status error">Students Book activity data could not be loaded.</div></Card>;
  const teacherPreview = capabilities.isReadOnly;
  if (activity.availability === "disabled" || activity.implementationMode === "unsupported-disabled") {
    if (!teacherPreview) return <Card><div className="inline-status error">Activity not found.</div></Card>;
    return <Card><h2>{activity.title}</h2><div className="inline-status">Editorial review required. This activity is disabled and unavailable to students.</div></Card>;
  }

  const questions = activity.runtime?.questions || [];
  const legacyUnitOpener = isUltimateB2Unit1LegacyOpener(activity);
  const media = (activity.mediaDependencies || []).filter((dependency) => dependency.logicalKey);
  const frozen = submitted || completed || !capabilities.canEditAnswers;
  const updateAnswer = (questionId, value) => {
    if (!capabilities.canEditAnswers) return;
    setAnswers((current) => ({ ...current, [questionId]: value }));
    setCheckResults((current) => {
      if (!(questionId in current)) return current;
      const next = { ...current };
      delete next[questionId];
      return next;
    });
  };
  const submit = async () => {
    if (!capabilities.canSubmitStudentWork) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const result = await onSubmit?.({
        activityKey: activity.stableNormalizedId,
        activityId: activity.stableNormalizedId,
        answers: responsePayload(activity, answers),
        score: null,
        implementationMode: activity.implementationMode,
        status: activity.implementationMode === "teacher-reviewed" ? "awaiting_review" : "submitted",
      });
      setServerResult(result || null);
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error.message || "Submission could not be saved.");
    } finally {
      setSubmitting(false);
    }
  };
  const markComplete = async () => {
    if (!capabilities.canSubmitStudentWork) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await onSubmit?.({ activityKey: activity.stableNormalizedId, activityId: activity.stableNormalizedId, answers: responsePayload(activity, answers), score: null, implementationMode: activity.implementationMode, status: "completed" });
      setCompleted(true);
    } catch (error) {
      setSubmitError(error.message || "Completion could not be saved.");
    } finally {
      setSubmitting(false);
    }
  };
  const reset = () => {
    if (!capabilities.canResetActivity) return;
    presentationStateVersion.current += 1;
    const emptyAttempt = resetPresentationAttempt();
    setAnswers(emptyAttempt.answers);
    setSubmitted(false);
    setCompleted(false);
    setServerResult(null);
    setSubmitError("");
    setSolutionError("");
    setRevealedQuestionIds(emptyAttempt.revealedQuestionIds);
    setCheckResults(emptyAttempt.checkResults);
  };

  const loadSolutions = async () => {
    if (!capabilities.canRequestSolutions && !capabilities.canUseOfflineSolutions) return null;
    if (solutions) return solutions;
    if (capabilities.canUseOfflineSolutions) {
      const payload = getOfflineTeacherSolution(activity.stableNormalizedId);
      if (!payload) {
        setSolutionError("No verified answer is available for this activity.");
        return null;
      }
      setSolutions(payload);
      return payload;
    }
    solutionRequest.current?.abort();
    const controller = new AbortController();
    const requestedActivityId = activity.stableNormalizedId;
    solutionRequest.current = controller;
    setSolutionsLoading(true);
    setSolutionError("");
    try {
      const payload = await getTeacherActivitySolutions(activity.stableNormalizedId, { signal: controller.signal });
      if (controller.signal.aborted || currentActivityId.current !== requestedActivityId) return null;
      setSolutions(payload);
      return payload;
    } catch (error) {
      if (controller.signal.aborted) return null;
      if (error.status === 401) setSolutionError("Your session has expired. Sign in again to request teacher solutions.");
      else if (error.status === 403) setSolutionError("This teacher account does not have access to solutions for this book.");
      else if (error.status === 404) setSolutionError("This activity is unavailable or disabled.");
      else setSolutionError("Solutions could not be loaded. Check the connection and try again.");
      return null;
    } finally {
      if (!controller.signal.aborted) setSolutionsLoading(false);
      if (solutionRequest.current === controller) solutionRequest.current = null;
    }
  };

  const revealQuestion = async (questionId) => {
    const stateVersion = presentationStateVersion.current;
    const payload = await loadSolutions();
    if (stateVersion !== presentationStateVersion.current) return;
    if (!payload?.questions?.[questionId]?.acceptedAnswers?.length) return;
    setRevealedQuestionIds((current) => revealPresentationQuestion(current, questionId));
  };

  const revealAll = async () => {
    const stateVersion = presentationStateVersion.current;
    const payload = await loadSolutions();
    if (!payload || stateVersion !== presentationStateVersion.current) return;
    setRevealedQuestionIds(verifiedSolutionQuestionIds(payload));
  };

  const checkAnswers = async () => {
    const stateVersion = presentationStateVersion.current;
    const payload = await loadSolutions();
    if (!payload || stateVersion !== presentationStateVersion.current) return;
    setCheckResults(checkPresentationAnswers(answers, payload));
  };

  const reviewState = serverResult || submission;
  const solutionMessage = solutions?.solutionAvailability === "open-response"
    ? "Open response — no single correct answer."
    : solutions?.solutionAvailability === "missing"
      ? "No verified answer is available for this activity."
      : "";
  const mediaPlayers = media.map((dependency) => (
    <StudentsBookMediaPlayer
      key={dependency.logicalKey}
      logicalKey={dependency.logicalKey}
      type={dependency.type}
      className="unit2-normalized-media legacy-pilot-primary-media"
    />
  ));
  const activityActions = (
    <>
      {capabilities.canSubmitStudentWork && ["auto-scored", "teacher-reviewed"].includes(activity.implementationMode) && !submitted && (
        <button className="primary-action" type="button" onClick={submit} disabled={submitting || questions.some((question) => !String(answers[question.id] || "").trim())}>{submitting ? "Submitting…" : "Submit"}</button>
      )}
      {capabilities.canSubmitStudentWork && ["unscored-practice", "reading-content"].includes(activity.implementationMode) && !completed && (
        <button className="primary-action" type="button" onClick={markComplete} disabled={submitting}>{submitting ? "Saving…" : "Mark complete"}</button>
      )}
      {submitted && activity.implementationMode === "teacher-reviewed" && <div className="inline-status success">Submitted · Awaiting teacher review <small>Application feedback</small></div>}
      {submitted && activity.implementationMode === "auto-scored" && (
        <div className="inline-status success">{Number.isFinite(serverResult?.scorePercent) ? `${serverResult.correctCount}/${serverResult.totalCount} correct · ${serverResult.scorePercent}%` : "Submitted"} <small>Application feedback</small></div>
      )}
      {completed && <div className="inline-status success">Completed <small>Application feedback</small></div>}
      {reviewState?.status === "reviewed" && <div className="inline-status success">Reviewed{reviewState.teacherFeedback ? ` · ${reviewState.teacherFeedback}` : ""} <small>Teacher feedback</small></div>}
      {submitError && <div className="inline-status error">{submitError}</div>}
      {capabilities.isPresentation && !legacyUnitOpener && (
        <div className="teacher-presentation-answer-controls" aria-label="Presentation answer controls">
          <button className="primary-action" type="button" onClick={checkAnswers} disabled={solutionsLoading || Boolean(solutions && solutions.solutionAvailability !== "explicit")}>
            {solutionsLoading ? "Loading solutions…" : "Check"}
          </button>
          <button className="secondary-action" type="button" onClick={reset}>Reset</button>
          <button className="secondary-action" type="button" onClick={revealAll} disabled={solutionsLoading || solutions?.solutionAvailability !== undefined && solutions.solutionAvailability !== "explicit"}>
            Show all answers
          </button>
          <button className="secondary-action" type="button" onClick={() => setRevealedQuestionIds(hidePresentationAnswers())} disabled={!revealedQuestionIds.length}>
            Hide answers
          </button>
        </div>
      )}
      {solutionsLoading && <div className="inline-status">Loading verified teacher solutions…</div>}
      {solutionMessage && <div className="inline-status warning">{solutionMessage}</div>}
      {solutionError && <div className="inline-status error">{solutionError}</div>}
      {(submitted || completed) && capabilities.canSubmitStudentWork && <button className="secondary-action" type="button" onClick={reset}>Try again</button>}
    </>
  );

  if (legacyUnitOpener) {
    return (
      <UltimateB2LegacyUnitOpenerActivity
        activity={activity}
        capabilities={capabilities}
        answers={answers}
        frozen={frozen}
        updateAnswer={updateAnswer}
        revealedQuestionIds={revealedQuestionIds}
        solutions={solutions}
        solutionsLoading={solutionsLoading}
        revealQuestion={revealQuestion}
        actions={activityActions}
      />
    );
  }

  if (isUltimateB2Unit1Part2LegacyPilot(activity)) {
    return (
      <UltimateB2LegacyPilotActivity
        activity={activity}
        capabilities={capabilities}
        answers={answers}
        frozen={frozen}
        updateAnswer={updateAnswer}
        checkResults={checkResults}
        revealedQuestionIds={revealedQuestionIds}
        solutions={solutions}
        solutionsLoading={solutionsLoading}
        revealQuestion={revealQuestion}
        mediaPlayers={mediaPlayers}
        actions={activityActions}
      />
    );
  }

  return (
    <Card className={`unit2-normalized-activity ${capabilities.isPresentation ? "teacher-presentation-activity" : ""}`}>
      <div className="card-heading">
        <div>
          <span className="eyebrow">Students Book · Unit {activity.unitNumber}</span>
          <h2>{activity.title}</h2>
          {activity.visibleInstructionText && <p>{activity.visibleInstructionText}</p>}
        </div>
        <Tag tone={activity.implementationMode === "auto-scored" ? "green" : activity.implementationMode === "teacher-reviewed" ? "gold" : "blue"}>
          {studentsBookImplementationModeLabels[activity.implementationMode] || activity.implementationMode}
        </Tag>
      </div>

      {mediaPlayers}

      {questions.length > 0 && (
        <div className="unit2-normalized-question-list">
          {questions.map((question, index) => (
            <label key={question.id} className={`unit2-normalized-question ${checkResults[question.id] ? `presentation-answer-${checkResults[question.id]}` : ""}`}>
              <span>{index + 1}</span>
              <strong>{question.prompt}</strong>
              {question.options.length ? (
                <select value={answers[question.id] || ""} disabled={frozen} onChange={(event) => updateAnswer(question.id, event.target.value)}>
                  <option value="">Choose…</option>
                  {question.options.map((option) => <option key={option.id} value={option.text}>{option.text}</option>)}
                </select>
              ) : activity.implementationMode === "teacher-reviewed" ? (
                <textarea rows={4} value={answers[question.id] || ""} disabled={frozen} onChange={(event) => updateAnswer(question.id, event.target.value)} />
              ) : (
                <input type="text" value={answers[question.id] || ""} disabled={frozen} onChange={(event) => updateAnswer(question.id, event.target.value)} />
              )}
              {capabilities.canRevealSolutions && (
                <span className="presentation-question-actions">
                  <button
                    className="secondary-action compact-action"
                    type="button"
                    disabled={solutionsLoading || Boolean(solutions && !solutions.questions?.[question.id])}
                    onClick={() => revealQuestion(question.id)}
                  >
                    Show answer
                  </button>
                  {checkResults[question.id] && <b className={`presentation-check-result ${checkResults[question.id]}`}>{checkResults[question.id] === "correct" ? "Correct" : checkResults[question.id] === "incorrect" ? "Try again" : "No answer"}</b>}
                </span>
              )}
              {revealedQuestionIds.includes(question.id) && solutions?.questions?.[question.id] && (
                <span className="presentation-revealed-answer">
                  <small>Publisher answer</small>
                  <strong>{solutions.questions[question.id].acceptedAnswers.join(" / ")}</strong>
                </span>
              )}
            </label>
          ))}
        </div>
      )}

      {activityActions}
    </Card>
  );
}

export { findStudentsBookImplementation };

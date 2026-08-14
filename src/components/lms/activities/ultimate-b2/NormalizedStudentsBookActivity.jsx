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
import { getUltimateB2OpenResponseAuthoring, hasUltimateB2OpenResponseAuthoring } from "../../../../data/ultimate-b2/openResponseAuthoringData.js";
import { applyUltimateB2HostedOpenResponseDraft } from "../../../../data/ultimate-b2/hostedOpenResponseDraft.js";
import {
  applyUltimateB2HostedOpenResponseImport,
  normalizeUltimateB2HostedOpenResponseImport,
} from "../../../../data/ultimate-b2/hostedOpenResponseImport.js";
import { UltimateB2LegacyUnitOpenerActivity } from "./UltimateB2LegacyUnitOpenerActivity.jsx";
import { isUltimateB2ImageActivity } from "../../../../data/ultimate-b2/unit1Part1Exercise2Image.js";
import { UltimateB2ImageActivity } from "./UltimateB2ImageActivity.jsx";
import { TeacherPresentationControls, TeacherQuestionFeedback } from "virtual:teacher-answer-ui";
import { activeBuildProfile } from "../../../../config/buildProfiles.js";

const studentAndroidBuild = import.meta.env.VITE_APP_MODE === "android-offline";

export function findUnit2Implementation(id) {
  const activity = findStudentsBookImplementation(id);
  return activity?.unitNumber === 2 ? activity : null;
}

export function StudentsBookMediaPlayer({
  logicalKey,
  type,
  className = "unit2-normalized-media",
  captionTrack = null,
  captionLabel = "English",
  captionsEnabled = false,
  autoPlay = false,
  controls = true,
  mediaElementRef = null,
  onTimeUpdate,
  onDurationChange,
  onPlayStateChange,
  onVolumeChange,
  onClick,
}) {
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
  useEffect(() => {
    const track = mediaRef.current?.textTracks?.[0];
    if (track) track.mode = captionsEnabled ? "showing" : "hidden";
  }, [captionTrack, captionsEnabled]);
  useEffect(() => {
    if (!mediaElementRef) return undefined;
    mediaElementRef.current = mediaRef.current;
    return () => {
      if (mediaElementRef.current === mediaRef.current) mediaElementRef.current = null;
    };
  }, [mediaElementRef, asset.url]);
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
            controls={controls}
            controlsList="nofullscreen nodownload noremoteplayback"
            disablePictureInPicture
            autoPlay={autoPlay}
            playsInline
            preload="metadata"
            src={asset.url}
            onClick={onClick}
            onPlay={() => {
              announcePlayback();
              onPlayStateChange?.(true);
            }}
            onPause={() => onPlayStateChange?.(false)}
            onEnded={() => onPlayStateChange?.(false)}
            onTimeUpdate={(event) => onTimeUpdate?.(event.currentTarget.currentTime)}
            onDurationChange={(event) => onDurationChange?.(event.currentTarget.duration)}
            onVolumeChange={(event) => onVolumeChange?.({
              muted: event.currentTarget.muted,
              volume: event.currentTarget.volume,
            })}
            onLoadedMetadata={(event) => {
              const track = mediaRef.current?.textTracks?.[0];
              if (track) track.mode = captionsEnabled ? "showing" : "hidden";
              onDurationChange?.(event.currentTarget.duration);
            }}
            onError={() => setMediaError("This local video format could not be played on this device.")}
          >
            {captionTrack && <track kind="captions" src={captionTrack} srcLang="en" label={captionLabel} default={captionsEnabled} />}
          </video>
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
  const payload = {};
  activity.runtime.questions.forEach((question, index) => {
    payload[String(question.number ?? index + 1)] = answers[question.id] || "";
  });
  return payload;
}

function persistedSubmissionResult(submission) {
  if (!(submission?.submissionId || submission?.submittedAt)) return null;
  return {
    status: submission.submissionStatus || submission.status || "submitted",
    scorePercent: submission.scorePercent ?? submission.score ?? null,
    correctCount: submission.correctCount ?? null,
    totalCount: submission.totalCount ?? null,
    teacherFeedback: submission.teacherFeedback || "",
  };
}

export function NormalizedStudentsBookActivity({ activityId, mode = "student", onSubmit, submission = null, listeningPresentation = null, activityPresentation = null, activityPublicDraft = null, activityPublicImport = null, activityTeacherSolution = null }) {
  const canonicalActivity = findStudentsBookImplementation(activityId);
  let activity = canonicalActivity;
  let importedOpenResponseAuthoring = null;
  try {
    const expectedQuestionIds = canonicalActivity.runtime.questions.map((question) => question.id);
    importedOpenResponseAuthoring = normalizeUltimateB2HostedOpenResponseImport(activityPublicImport, activityId, expectedQuestionIds, { assetPathPolicy: "runtime" });
    activity = applyUltimateB2HostedOpenResponseImport(canonicalActivity, importedOpenResponseAuthoring);
  } catch { activity = canonicalActivity; importedOpenResponseAuthoring = null; }
  try { activity = applyUltimateB2HostedOpenResponseDraft(activity, activityPublicDraft); } catch { /* retain the imported/canonical base */ }
  const capabilities = getActivityModeCapabilities(mode);
  const initialSubmissionResult = persistedSubmissionResult(submission);
  const persistedSubmission = Boolean(initialSubmissionResult);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(persistedSubmission);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverResult, setServerResult] = useState(initialSubmissionResult);
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
    setSubmitted(persistedSubmission);
    setCompleted(false);
    setSubmitting(false);
    setServerResult(persistedSubmissionResult(submission));
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
  }, [activityId, activityTeacherSolution, persistedSubmission, submission?.submissionId, submission?.submittedAt, submission?.submissionStatus, submission?.scorePercent, submission?.correctCount, submission?.totalCount, submission?.teacherFeedback]);

  if (!activity) return <Card><div className="inline-status error">Students Book activity data could not be loaded.</div></Card>;
  const teacherPreview = capabilities.isReadOnly;
  if (activity.availability === "disabled" || activity.implementationMode === "unsupported-disabled") {
    if (!teacherPreview) return <Card><div className="inline-status error">Activity not found.</div></Card>;
    return <Card><h2>{activity.title}</h2><div className="inline-status">Editorial review required. This activity is disabled and unavailable to students.</div></Card>;
  }

  const questions = activity.runtime?.questions || [];
  const authoredOpenResponse = Boolean(importedOpenResponseAuthoring) || hasUltimateB2OpenResponseAuthoring(activity);
  const canonicalOpenResponseAuthoring = getUltimateB2OpenResponseAuthoring(activity);
  const baseOpenResponseAuthoring = importedOpenResponseAuthoring || canonicalOpenResponseAuthoring;
  const openResponseAuthoring = baseOpenResponseAuthoring
    ? { ...baseOpenResponseAuthoring, questions: baseOpenResponseAuthoring.questions.map((question) => ({ ...question, prompt: activity.runtime.questions.find((runtimeQuestion) => runtimeQuestion.id === question.id)?.prompt || question.prompt })) }
    : null;
  const importedTeacherSolution = activityTeacherSolution?.questions ? activityTeacherSolution : null;
  const legacyPilotObjectOne = activity.stableNormalizedId === "ultimate-b2-sb-u1-p2-o1";
  const legacyPilotObjectTwo = activity.stableNormalizedId === "ultimate-b2-sb-u1-p2-o2";
  const teacherOfflineListening = legacyPilotObjectTwo && capabilities.isPresentation && activeBuildProfile.teacherPresentation;
  const teacherOfflineMultipleChoice = activity.stableNormalizedId === "ultimate-b2-sb-u1-p2-o3" && capabilities.isPresentation && activeBuildProfile.teacherPresentation && activityPresentation?.multipleChoiceAuthoring;
  const imageActivity = isUltimateB2ImageActivity(activity);
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
  const replaceAnswers = (nextAnswers) => {
    if (!capabilities.canEditAnswers) return;
    setAnswers(nextAnswers);
    setCheckResults({});
  };
  const submit = async () => {
    if (!capabilities.canSubmitStudentWork) return;
    if (typeof onSubmit !== "function") {
      setSubmitError("This is independent practice. Open the activity from Assignments to submit work to your teacher.");
      return false;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const result = await onSubmit({
        activityKey: activity.stableNormalizedId,
        activityId: activity.stableNormalizedId,
        answers: responsePayload(activity, answers),
        score: null,
        implementationMode: activity.implementationMode,
        status: activity.implementationMode === "teacher-reviewed" ? "awaiting_review" : "submitted",
      });
      setServerResult(result || null);
      setSubmitted(true);
      return true;
    } catch (error) {
      setSubmitError(error.message || "Submission could not be saved.");
      return false;
    } finally {
      setSubmitting(false);
    }
  };
  const markComplete = async () => {
    if (!capabilities.canSubmitStudentWork) return;
    if (typeof onSubmit !== "function") {
      setSubmitError("This is independent practice. Open the activity from Assignments to save completion.");
      return false;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      await onSubmit({ activityKey: activity.stableNormalizedId, activityId: activity.stableNormalizedId, answers: responsePayload(activity, answers), score: null, implementationMode: activity.implementationMode, status: "completed" });
      setCompleted(true);
      return true;
    } catch (error) {
      setSubmitError(error.message || "Completion could not be saved.");
      return false;
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
      const payload = importedTeacherSolution || getOfflineTeacherSolution(activity.stableNormalizedId);
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
      {capabilities.isPresentation && !authoredOpenResponse && !legacyPilotObjectOne && !teacherOfflineListening && !teacherOfflineMultipleChoice && !imageActivity && <TeacherPresentationControls solutionsLoading={solutionsLoading} solutions={solutions} revealedCount={revealedQuestionIds.length} onCheck={checkAnswers} onReset={reset} onRevealAll={revealAll} onHide={() => setRevealedQuestionIds(hidePresentationAnswers())} />}
      {!studentAndroidBuild && solutionsLoading && <div className="inline-status">Loading verified teacher solutions…</div>}
      {!studentAndroidBuild && solutionMessage && <div className="inline-status warning">{solutionMessage}</div>}
      {!studentAndroidBuild && solutionError && <div className="inline-status error">{solutionError}</div>}
      {(submitted || completed) && !persistedSubmission && capabilities.canSubmitStudentWork && <button className="secondary-action" type="button" onClick={reset}>Try again</button>}
    </>
  );

  if (authoredOpenResponse) {
    return (
      <UltimateB2LegacyUnitOpenerActivity
        activity={activity}
        authoring={openResponseAuthoring}
        capabilities={capabilities}
        answers={answers}
        frozen={frozen}
        updateAnswer={updateAnswer}
        revealedQuestionIds={revealedQuestionIds}
        solutions={solutions}
        solutionsLoading={solutionsLoading}
        revealQuestion={revealQuestion}
        revealAll={revealAll}
        resetReveals={() => { presentationStateVersion.current += 1; setRevealedQuestionIds([]); }}
        activityPresentation={activityPresentation}
        actions={activityActions}
      />
    );
  }

  if (imageActivity) {
    return <UltimateB2ImageActivity activity={activity} />;
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
        requestTeacherSolutions={loadSolutions}
        revealQuestion={revealQuestion}
        mediaPlayers={mediaPlayers}
        actions={(legacyPilotObjectOne && capabilities.isPresentation) || teacherOfflineListening || teacherOfflineMultipleChoice ? null : activityActions}
        listeningPresentation={listeningPresentation}
        activityPresentation={activityPresentation}
        studentSubmission={{ answers, frozen, submitting, submitted, serverResult, submitError, replaceAnswers, onSubmit: submit }}
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
              <TeacherQuestionFeedback capabilities={capabilities} question={question} checkResult={checkResults[question.id]} revealed={revealedQuestionIds.includes(question.id)} solutions={solutions} solutionsLoading={solutionsLoading} revealQuestion={revealQuestion} />
            </label>
          ))}
        </div>
      )}

      {activityActions}
    </Card>
  );
}

export { findStudentsBookImplementation };

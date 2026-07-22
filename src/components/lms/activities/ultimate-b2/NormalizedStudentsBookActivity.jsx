import { useState } from "react";

import unit1Runtime from "../../../../data/ultimate-b2/generated/unit-01.runtime.json" with { type: "json" };
import unit2Runtime from "../../../../data/ultimate-b2/generated/unit-02.runtime.json" with { type: "json" };
import studentsBookRuntime from "../../../../data/ultimate-b2/generated/students-book.runtime.json" with { type: "json" };
import { useBookAsset } from "../../../../hooks/useBookAsset.js";
import { Card, Tag } from "../../Shared.jsx";
import { ultimateB2StudentsBookMedia } from "virtual:ultimate-b2-media-assets";

const activities = [...(unit1Runtime.activities || []), ...(unit2Runtime.activities || [])];
const activityAliases = new Map(
  (studentsBookRuntime.units || []).flatMap((unit) => unit.pages || [])
    .flatMap((page) => page.activities || [])
    .filter((activity) => activity.activityKey && activity.id && activity.activityKey !== activity.id)
    .map((activity) => [activity.activityKey, activity.id]),
);

export function findStudentsBookImplementation(id) {
  const stableId = activityAliases.get(id) || id;
  return activities.find((activity) => activity.stableNormalizedId === stableId) || null;
}

export function findUnit2Implementation(id) {
  const activity = findStudentsBookImplementation(id);
  return activity?.unitNumber === 2 ? activity : null;
}

export function StudentsBookMediaPlayer({ logicalKey, type, className = "unit2-normalized-media" }) {
  const offlineAsset = ultimateB2StudentsBookMedia[logicalKey] || null;
  const androidLocalUrl = import.meta.env.VITE_APP_MODE === "android-offline" ? offlineAsset?.localUrl : null;
  const asset = useBookAsset(androidLocalUrl ? null : logicalKey, {
    devFallbackUrl: androidLocalUrl || (import.meta.env.DEV ? offlineAsset?.devFallbackUrl : null),
  });
  if (asset.loading) return <div className="inline-status">Loading {type}…</div>;
  if (!asset.url) {
    return (
      <div className="inline-status error">
        This protected {type} is not available right now.
        <button className="secondary-action compact-action" type="button" onClick={asset.retry}>Try again</button>
      </div>
    );
  }
  return type === "video"
    ? <video className={className} controls preload="metadata" src={asset.url} />
    : <audio className={className} controls preload="metadata" src={asset.url} />;
}

function responsePayload(activity, answers) {
  const payload = { ...answers };
  activity.runtime.questions.forEach((question, index) => { payload[String(index + 1)] = answers[question.id] || ""; });
  return payload;
}

export function NormalizedStudentsBookActivity({ activityId, mode = "student", onSubmit, submission = null }) {
  const activity = findStudentsBookImplementation(activityId);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverResult, setServerResult] = useState(null);
  const [submitError, setSubmitError] = useState("");

  if (!activity) return <Card><div className="inline-status error">Students Book activity data could not be loaded.</div></Card>;
  const teacherPreview = mode === "teacher-preview";
  if (activity.availability === "disabled" || activity.implementationMode === "unsupported-disabled") {
    if (!teacherPreview) return <Card><div className="inline-status error">Activity not found.</div></Card>;
    return <Card><h2>{activity.title}</h2><div className="inline-status">Editorial review required. This activity is disabled and unavailable to students.</div></Card>;
  }

  const questions = activity.runtime?.questions || [];
  const media = (activity.mediaDependencies || []).filter((dependency) => dependency.logicalKey);
  const frozen = submitted || completed || teacherPreview;
  const submit = async () => {
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
  const reset = () => { setAnswers({}); setSubmitted(false); setCompleted(false); setServerResult(null); setSubmitError(""); };
  const reviewState = serverResult || submission;

  return (
    <Card className="unit2-normalized-activity">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Students Book · Unit {activity.unitNumber}</span>
          <h2>{activity.title}</h2>
          {activity.visibleInstructionText && <p>{activity.visibleInstructionText}</p>}
        </div>
        <Tag tone={activity.implementationMode === "auto-scored" ? "green" : activity.implementationMode === "teacher-reviewed" ? "gold" : "blue"}>{activity.implementationMode}</Tag>
      </div>

      {media.map((dependency) => <StudentsBookMediaPlayer key={dependency.logicalKey} logicalKey={dependency.logicalKey} type={dependency.type} />)}

      {questions.length > 0 && (
        <div className="unit2-normalized-question-list">
          {questions.map((question, index) => (
            <label key={question.id} className="unit2-normalized-question">
              <span>{index + 1}</span>
              <strong>{question.prompt}</strong>
              {question.options.length ? (
                <select value={answers[question.id] || ""} disabled={frozen} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}>
                  <option value="">Choose…</option>
                  {question.options.map((option) => <option key={option.id} value={option.text}>{option.text}</option>)}
                </select>
              ) : activity.implementationMode === "teacher-reviewed" ? (
                <textarea rows={4} value={answers[question.id] || ""} disabled={frozen} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} />
              ) : (
                <input type="text" value={answers[question.id] || ""} disabled={frozen} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} />
              )}
            </label>
          ))}
        </div>
      )}

      {mode === "student" && ["auto-scored", "teacher-reviewed"].includes(activity.implementationMode) && !submitted && (
        <button className="primary-action" type="button" onClick={submit} disabled={submitting || questions.some((question) => !String(answers[question.id] || "").trim())}>{submitting ? "Submitting…" : "Submit"}</button>
      )}
      {mode === "student" && ["unscored-practice", "reading-content"].includes(activity.implementationMode) && !completed && (
        <button className="primary-action" type="button" onClick={markComplete} disabled={submitting}>{submitting ? "Saving…" : "Mark complete"}</button>
      )}
      {submitted && activity.implementationMode === "teacher-reviewed" && <div className="inline-status success">Submitted · Awaiting teacher review <small>Application feedback</small></div>}
      {submitted && activity.implementationMode === "auto-scored" && (
        <div className="inline-status success">{Number.isFinite(serverResult?.scorePercent) ? `${serverResult.correctCount}/${serverResult.totalCount} correct · ${serverResult.scorePercent}%` : "Submitted"} <small>Application feedback</small></div>
      )}
      {completed && <div className="inline-status success">Completed <small>Application feedback</small></div>}
      {reviewState?.status === "reviewed" && <div className="inline-status success">Reviewed{reviewState.teacherFeedback ? ` · ${reviewState.teacherFeedback}` : ""} <small>Teacher feedback</small></div>}
      {submitError && <div className="inline-status error">{submitError}</div>}
      {(submitted || completed) && mode === "student" && <button className="secondary-action" type="button" onClick={reset}>Try again</button>}
    </Card>
  );
}

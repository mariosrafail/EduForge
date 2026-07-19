import { useState } from "react";
import runtimeCatalog from "../../../../data/ultimate-b2/generated/unit-02.runtime.json" with { type: "json" };
import { useBookAsset } from "../../../../hooks/useBookAsset.js";
import { Card, Tag } from "../../Shared.jsx";
import { ultimateB2Unit2Media } from "virtual:ultimate-b2-media-assets";

const activities = runtimeCatalog.activities || [];

export function findUnit2Implementation(id) {
  return activities.find((activity) => activity.stableNormalizedId === id) || null;
}

function MediaPlayer({ dependency }) {
  const offlineAsset = ultimateB2Unit2Media[dependency.logicalKey] || null;
  const androidLocalUrl = import.meta.env.VITE_APP_MODE === "android-offline" ? offlineAsset?.localUrl : null;
  const asset = useBookAsset(androidLocalUrl ? null : dependency.logicalKey, {
    devFallbackUrl: androidLocalUrl || (import.meta.env.DEV ? dependency.localDevelopmentPath : null),
  });
  if (asset.loading) return <div className="inline-status">Loading {dependency.type}…</div>;
  if (!asset.url) {
    return (
      <div className="inline-status error">
        This protected {dependency.type} is not available right now.
        <button className="secondary-action compact-action" type="button" onClick={asset.retry}>Try again</button>
      </div>
    );
  }
  return dependency.type === "video"
    ? <video className="unit2-normalized-media" controls preload="metadata" src={asset.url} />
    : <audio className="unit2-normalized-media" controls preload="metadata" src={asset.url} />;
}

function responsePayload(activity, answers) {
  const payload = { ...answers };
  activity.runtime.questions.forEach((question, index) => { payload[String(index + 1)] = answers[question.id] || ""; });
  return payload;
}

export function NormalizedUnit2Activity({ activityId, mode = "student", onSubmit }) {
  const activity = findUnit2Implementation(activityId);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverResult, setServerResult] = useState(null);
  const [submitError, setSubmitError] = useState("");

  if (!activity) return <Card><div className="inline-status error">Unit 2 activity data could not be loaded.</div></Card>;
  if (activity.implementationMode === "unsupported-disabled") {
    return <Card><h2>{activity.title}</h2><div className="inline-status">Editorial review required. This activity is not available to students.</div></Card>;
  }

  const questions = activity.runtime?.questions || [];
  const media = (activity.mediaDependencies || []).filter((dependency) => dependency.logicalKey);
  const teacherPreview = mode === "teacher-preview";
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

  const reset = () => {
    setAnswers({});
    setSubmitted(false);
    setServerResult(null);
    setSubmitError("");
  };

  const markComplete = () => {
    setCompleted(true);
    onSubmit?.({ activityKey: activity.stableNormalizedId, activityId: activity.stableNormalizedId, answers: {}, score: null, implementationMode: activity.implementationMode, status: "completed" });
  };

  return (
    <Card className="unit2-normalized-activity">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Students Book · Unit 2</span>
          <h2>{activity.title}</h2>
          {activity.visibleInstructionText && <p>{activity.visibleInstructionText}</p>}
        </div>
        <Tag tone={activity.implementationMode === "auto-scored" ? "green" : activity.implementationMode === "teacher-reviewed" ? "gold" : "blue"}>
          {activity.implementationMode}
        </Tag>
      </div>

      {media.map((dependency) => <MediaPlayer key={dependency.logicalKey} dependency={dependency} />)}

      {questions.length > 0 && (
        <div className="unit2-normalized-question-list">
          {questions.map((question, index) => {
            return (
              <label key={question.id} className="unit2-normalized-question">
                <span>{index + 1}</span>
                <strong>{question.prompt}</strong>
                {question.options.length ? (
                  <select value={answers[question.id] || ""} disabled={submitted || teacherPreview} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}>
                    <option value="">Choose…</option>
                    {question.options.map((option) => <option key={option.id} value={option.text}>{option.text}</option>)}
                  </select>
                ) : activity.implementationMode === "teacher-reviewed" ? (
                  <textarea rows={4} value={answers[question.id] || ""} disabled={submitted || teacherPreview} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} />
                ) : (
                  <input type="text" value={answers[question.id] || ""} disabled={submitted || teacherPreview} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} />
                )}
              </label>
            );
          })}
        </div>
      )}

      {mode === "student" && ["auto-scored", "teacher-reviewed"].includes(activity.implementationMode) && !submitted && (
        <button className="primary-action" type="button" onClick={submit} disabled={submitting || questions.some((question) => !String(answers[question.id] || "").trim())}>{submitting ? "Submitting…" : "Submit"}</button>
      )}
      {mode === "student" && ["unscored-practice", "reading-content", "media-interaction"].includes(activity.implementationMode) && !completed && (
        <button className="primary-action" type="button" onClick={markComplete}>Mark complete</button>
      )}
      {submitted && activity.implementationMode === "teacher-reviewed" && <div className="inline-status success">Submitted · Awaiting teacher review <small>Application feedback</small></div>}
      {submitted && activity.implementationMode === "auto-scored" && (
        <div className="inline-status success">
          {Number.isFinite(serverResult?.scorePercent)
            ? `${serverResult.correctCount}/${serverResult.totalCount} correct · ${serverResult.scorePercent}%`
            : "Submitted"} <small>Application feedback</small>
        </div>
      )}
      {completed && <div className="inline-status success">Completed <small>Application feedback</small></div>}
      {submitError && <div className="inline-status error">{submitError}</div>}
      {submitted && mode === "student" && <button className="secondary-action" type="button" onClick={reset}>Try again</button>}
    </Card>
  );
}

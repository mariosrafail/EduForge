import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { getBookActivity, scoreBookActivity } from "../../../../services/bookActivitiesApi.js";

function ActivityShell({ activity, children, onClose }) {
  return (
    <div className="book-activity-modal-backdrop" role="presentation">
      <div className="book-activity-runner-modal" role="dialog" aria-modal="true" aria-label={activity?.title || "Book activity"}>
        <header>
          <div>
            <span className="eyebrow">{activity?.type || "Activity"}</span>
            <h3>{activity?.title || "Loading activity"}</h3>
            {activity?.instructions && <p>{activity.instructions}</p>}
          </div>
          <button className="image-zoom-close-button" type="button" onClick={onClose} aria-label="Close activity"><X size={18} /></button>
        </header>
        <div className="book-activity-runner-body">{children}</div>
      </div>
    </div>
  );
}

function SubmissionState({ result, error, onReset }) {
  if (error) return <p className="book-builder-error">{error}</p>;
  if (!result) return null;
  return (
    <div>
      <p className="book-runner-result">{Number.isFinite(result.scorePercent) ? `Score: ${result.correctCount}/${result.totalCount} · ${result.scorePercent}%` : result.status === "awaiting_review" ? "Submitted for teacher review." : "Completed"}</p>
      <button className="secondary-action compact-action" type="button" onClick={onReset}>Try again</button>
    </div>
  );
}

function useServerSubmission(activity) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (responses) => {
    setSubmitting(true);
    setError("");
    try {
      setResult(await scoreBookActivity(activity.id, responses));
    } catch (submissionError) {
      setError(submissionError.message || "Submission could not be scored.");
    } finally {
      setSubmitting(false);
    }
  };
  const reset = () => { setResult(null); setError(""); };
  return { result, error, submitting, submit, reset };
}

function MultipleChoiceRunner({ activity }) {
  const questions = activity.content?.questions || [];
  const [answers, setAnswers] = useState({});
  const submission = useServerSubmission(activity);
  return (
    <div className="book-runner-form">
      {questions.map((question, index) => (
        <section key={question.id} className="book-runner-question">
          <strong>{index + 1}. {question.prompt}</strong>
          {(question.options || []).map((option) => (
            <label key={`${question.id}-${option}`}><input type="radio" name={question.id} checked={answers[question.id] === option} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))} /> {option}</label>
          ))}
        </section>
      ))}
      {!submission.result && <button className="primary-action compact-action" type="button" disabled={submission.submitting} onClick={() => submission.submit(answers)}>{submission.submitting ? "Submitting…" : "Submit"}</button>}
      <SubmissionState result={submission.result} error={submission.error} onReset={() => { setAnswers({}); submission.reset(); }} />
    </div>
  );
}

function OpenAnswerRunner({ activity }) {
  const [answer, setAnswer] = useState("");
  const submission = useServerSubmission(activity);
  return (
    <div className="book-runner-form">
      <p>{activity.content?.prompt}</p>
      <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} />
      {!submission.result && <button className="primary-action compact-action" type="button" disabled={submission.submitting} onClick={() => submission.submit({ answer })}>{submission.submitting ? "Submitting…" : "Submit"}</button>}
      <SubmissionState result={submission.result} error={submission.error} onReset={() => { setAnswer(""); submission.reset(); }} />
    </div>
  );
}

function TypedGapFillRunner({ activity }) {
  const items = activity.content?.items || [];
  const [answers, setAnswers] = useState({});
  const submission = useServerSubmission(activity);
  return (
    <div className="book-runner-form">
      {items.map((item, index) => (
        <label key={item.id}>{index + 1}. {item.prompt}<input value={answers[item.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
      ))}
      {!submission.result && <button className="primary-action compact-action" type="button" disabled={submission.submitting} onClick={() => submission.submit(answers)}>{submission.submitting ? "Submitting…" : "Submit"}</button>}
      <SubmissionState result={submission.result} error={submission.error} onReset={() => { setAnswers({}); submission.reset(); }} />
    </div>
  );
}

function MediaVideoRunner({ activity }) {
  return <video className="book-runner-media" src={activity.content?.mediaUrl} poster={activity.content?.posterUrl || undefined} controls />;
}

function MediaAudioRunner({ activity }) {
  return (
    <div className="book-runner-form">
      <audio className="book-runner-media" src={activity.content?.mediaUrl} controls />
      {activity.content?.transcript && <p className="book-runner-text">{activity.content.transcript}</p>}
    </div>
  );
}

function TextPanelRunner({ activity }) {
  return <div className="book-runner-text">{String(activity.content?.body || "").split("\n").map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div>;
}

function RunnerContent({ activity }) {
  if (activity.type === "multiple_choice") return <MultipleChoiceRunner activity={activity} />;
  if (activity.type === "open_answer") return <OpenAnswerRunner activity={activity} />;
  if (activity.type === "typed_gap_fill") return <TypedGapFillRunner activity={activity} />;
  if (activity.type === "media_video") return <MediaVideoRunner activity={activity} />;
  if (activity.type === "media_audio") return <MediaAudioRunner activity={activity} />;
  if (activity.type === "text_panel") return <TextPanelRunner activity={activity} />;
  if (activity.type === "external_link") return <a className="primary-action compact-action" href={activity.content?.url} target="_blank" rel="noreferrer">Open link</a>;
  return <p>This activity type is not supported yet.</p>;
}

export function BookActivityRunner({ activityId, activity: providedActivity = null, onClose }) {
  const [activity, setActivity] = useState(providedActivity);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(activityId && !providedActivity));
  const resolvedActivityId = useMemo(() => activityId || providedActivity?.id, [activityId, providedActivity]);

  useEffect(() => {
    if (!resolvedActivityId || providedActivity) return undefined;
    let mounted = true;
    setLoading(true);
    setError("");
    getBookActivity(resolvedActivityId)
      .then((item) => {
        if (mounted) setActivity(item);
      })
      .catch((err) => {
        if (mounted) setError(err.message || "Could not load activity.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [providedActivity, resolvedActivityId]);

  return (
    <ActivityShell activity={activity} onClose={onClose}>
      {loading && <p>Loading activity...</p>}
      {error && <p className="book-builder-error">{error}</p>}
      {activity && <RunnerContent activity={activity} />}
    </ActivityShell>
  );
}

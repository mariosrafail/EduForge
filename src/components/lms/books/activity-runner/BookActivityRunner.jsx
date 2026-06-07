import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { getBookActivity } from "../../../../services/bookActivitiesApi.js";
import { answerMatches } from "./activityRunnerScoring.js";

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

function MultipleChoiceRunner({ activity }) {
  const questions = activity.content?.questions || [];
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const submit = () => {
    const correct = questions.filter((question) => answers[question.id] === activity.correctAnswers?.[question.id]).length;
    setResult({ correct, total: questions.length });
  };
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
      <button className="primary-action compact-action" type="button" onClick={submit}>Submit</button>
      {result && <p className="book-runner-result">Score: {result.correct}/{result.total}</p>}
    </div>
  );
}

function OpenAnswerRunner({ activity }) {
  const accepted = activity.correctAnswers?.acceptedAnswers || activity.content?.acceptedAnswers || [];
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState("");
  return (
    <div className="book-runner-form">
      <p>{activity.content?.prompt}</p>
      <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} />
      <button className="primary-action compact-action" type="button" onClick={() => setResult(accepted.length ? (answerMatches(answer, accepted) ? "Correct" : "Check your answer and try again.") : "Submitted for teacher review.")}>Submit</button>
      {result && <p className="book-runner-result">{result}</p>}
    </div>
  );
}

function TypedGapFillRunner({ activity }) {
  const items = activity.content?.items || [];
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const submit = () => {
    const correct = items.filter((item) => answerMatches(answers[item.id], item.acceptedAnswers?.length ? item.acceptedAnswers : [item.answer])).length;
    setResult({ correct, total: items.length });
  };
  return (
    <div className="book-runner-form">
      {items.map((item, index) => (
        <label key={item.id}>{index + 1}. {item.prompt}<input value={answers[item.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
      ))}
      <button className="primary-action compact-action" type="button" onClick={submit}>Submit</button>
      {result && <p className="book-runner-result">Score: {result.correct}/{result.total}</p>}
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

import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Send } from "lucide-react";
import { activityTypeLabels } from "../../services/activitiesApi.js";
import { Card, Tag } from "./Shared.jsx";

function initialAnswers(activity) {
  if (activity.type === "multiple_choice") return { selectedIndex: "" };
  if (activity.type === "fill_blank") return { blank: "" };
  if (activity.type === "matching") {
    return { pairs: Object.fromEntries((activity.content.pairs || []).map((pair) => [pair.left, ""])) };
  }
  return { writing: "" };
}

export function AssignedActivity({ activities, assignments, submissions, onSubmit }) {
  const assignment = assignments[0];
  const activity = activities.find((item) => item.id === assignment?.activity_id);
  const latestSubmission = submissions.find((item) => item.assignment_id === assignment?.id);
  const [answers, setAnswers] = useState(() => activity ? initialAnswers(activity) : {});
  const [submitted, setSubmitted] = useState(null);

  const rightOptions = useMemo(() => activity?.type === "matching" ? (activity.content.pairs || []).map((pair) => pair.right).sort() : [], [activity]);

  useEffect(() => {
    if (activity) {
      setAnswers(initialAnswers(activity));
      setSubmitted(null);
    }
  }, [activity?.id]);

  if (!assignment || !activity) {
    return (
      <Card className="assigned-activity-panel">
        <span className="eyebrow">Assigned interactive activity</span>
        <h2>No assigned activity yet</h2>
        <p>When a teacher publishes interactive book-based practice, it appears here for the student to solve.</p>
      </Card>
    );
  }

  const submit = () => {
    const submission = onSubmit(assignment.id, answers);
    setSubmitted(submission);
  };

  const visibleSubmission = submitted || latestSubmission;

  return (
    <Card className="assigned-activity-panel priority-panel">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Assigned interactive activity</span>
          <h2>{activity.title}</h2>
          <p>{activity.book_title} / {activity.unit_title}</p>
        </div>
        <Tag tone={activity.type === "writing" ? "violet" : "green"}>{activity.type === "writing" ? "Needs teacher review" : "Auto-scored"}</Tag>
      </div>
      <div className="activity-meta-row">
        <Tag tone="blue">{activityTypeLabels[activity.type]}</Tag>
        <Tag tone="gold">{activity.skill}</Tag>
        <span>Due {assignment.due_date}</span>
        <span>Attempts {visibleSubmission?.attempt_number || 0}/{assignment.allowed_attempts}</span>
      </div>

      <div className="student-activity-shell">
        <strong>{activity.content.question || activity.content.prompt || activity.content.sentence}</strong>
        {activity.type === "multiple_choice" && (
          <div className="student-answer-list">
            {activity.content.options.map((option, index) => (
              <label key={option}>
                <input type="radio" name={activity.id} checked={String(answers.selectedIndex) === String(index)} onChange={() => setAnswers({ selectedIndex: index })} />
                {option}
              </label>
            ))}
          </div>
        )}
        {activity.type === "fill_blank" && (
          <label>
            Student answer
            <input value={answers.blank || ""} onChange={(event) => setAnswers({ blank: event.target.value })} placeholder="Type the missing word" />
          </label>
        )}
        {activity.type === "matching" && (
          <div className="matching-answer-grid">
            {(activity.content.pairs || []).map((pair) => (
              <label key={pair.left}>
                {pair.left}
                <select value={answers.pairs?.[pair.left] || ""} onChange={(event) => setAnswers({ pairs: { ...answers.pairs, [pair.left]: event.target.value } })}>
                  <option value="">Choose match</option>
                  {rightOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
        {activity.type === "writing" && (
          <label>
            Writing response
            <textarea value={answers.writing || ""} onChange={(event) => setAnswers({ writing: event.target.value })} placeholder="Write your answer for teacher review" />
          </label>
        )}
      </div>

      <button className="primary-action" onClick={submit}><Send size={17} /> Submit answers</button>

      {visibleSubmission && (
        <div className="correction-summary">
          <div>
            <strong>{visibleSubmission.needs_teacher_review ? "Submitted for teacher review" : `Score: ${visibleSubmission.score}%`}</strong>
            <span>Correct answers remain locked</span>
          </div>
          <div className="revision-grid">
            <article>
              <b>Mistakes</b>
              {(visibleSubmission.mistakes || []).map((item) => <p key={item}>{item}</p>)}
            </article>
            <article>
              <b>Revision guidance</b>
              {(visibleSubmission.revision_guidance || []).map((item) => <small key={item}>{item}</small>)}
            </article>
          </div>
          <small><RotateCcw size={14} /> Teacher can unlock another attempt after revision.</small>
        </div>
      )}
    </Card>
  );
}

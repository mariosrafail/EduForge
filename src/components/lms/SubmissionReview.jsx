import { useState } from "react";
import { BookOpenCheck, Save } from "lucide-react";
import { activityTypeLabels } from "../../services/activitiesApi.js";
import { Card, Tag } from "./Shared.jsx";

export function SubmissionReview({ submissions }) {
  const [reviewSaved, setReviewSaved] = useState(false);

  return (
    <Card className="submission-review-panel priority-panel">
      <div className="card-heading">
        <div>
          <span className="eyebrow"><BookOpenCheck size={15} /> Submissions from assigned activities</span>
          <h2>Scores, mistakes, and revision guidance</h2>
        </div>
        <Tag tone="green">{submissions.length} received</Tag>
      </div>

      {submissions.length === 0 ? (
        <div className="empty-user-state">
          <strong>No interactive activity submissions yet</strong>
          <span>Student submissions will appear here after solving an assigned activity.</span>
        </div>
      ) : (
        <div className="submission-list">
          {submissions.map((submission) => (
            <article key={submission.id}>
              <div className="submission-head">
                <div>
                  <strong>{submission.student_name}</strong>
                  <span>{submission.activity_title} / {activityTypeLabels[submission.activity_type]}</span>
                </div>
                <Tag tone={submission.needs_teacher_review ? "violet" : "green"}>{submission.needs_teacher_review ? "Needs teacher review" : "Auto-scored"}</Tag>
              </div>
              <div className="submission-score-row">
                <b>{submission.needs_teacher_review ? "Pending" : `${submission.score}%`}</b>
                <span>Attempt {submission.attempt_number}</span>
              </div>
              <p><strong>Mistakes:</strong> {(submission.mistakes || []).join(" ")}</p>
              <p><strong>Revision guidance:</strong> {(submission.revision_guidance || []).join(" ")}</p>
              {submission.needs_teacher_review && (
                <div className="teacher-review-box">
                  <label>
                    Score
                    <input type="number" min="0" max="100" placeholder="e.g. 78" />
                  </label>
                  <label>
                    Feedback
                    <textarea placeholder="Add writing feedback for the student" />
                  </label>
                  <button className="secondary-action compact-action" onClick={() => setReviewSaved(true)}><Save size={16} /> Save feedback</button>
                  {reviewSaved && <div className="inline-status success">Teacher review feedback saved for demo.</div>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

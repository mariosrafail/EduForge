import { Award, BookOpenCheck, RotateCcw } from "lucide-react";
import { Card, Tag } from "../Shared.jsx";

export function LessonCompletionSummary({ score, lesson, onRestart }) {
  return (
    <Card className="lesson-completion-summary priority-panel">
      <div className="completion-hero">
        <span><Award size={24} /></span>
        <div>
          <span className="eyebrow">Lesson complete</span>
          <h2>{score.percent}% total score</h2>
          <p>{score.correct}/{score.total} answers correct across {lesson.activities.length} activities.</p>
        </div>
      </div>

      <div className="completion-grid">
        <article>
          <strong>Skills practiced</strong>
          <div className="feedback-tags">
            {lesson.activities.map((activity) => <Tag key={activity.id} tone="blue">{activity.skill || activity.instruction}</Tag>)}
          </div>
        </article>
        <article>
          <strong>Recommended revision</strong>
          <p>Review highlighted vocabulary items, then repeat the activity where you lost marks before the next class.</p>
        </article>
        <article>
          <strong>Teacher visibility</strong>
          <p>Your teacher can view this result, check attempts, and assign follow-up practice.</p>
        </article>
      </div>

      <div className="lesson-actions">
        <button className="secondary-action" onClick={onRestart}><RotateCcw size={17} /> Restart lesson</button>
        <span className="inline-status success"><BookOpenCheck size={15} /> Results ready for teacher review.</span>
      </div>
    </Card>
  );
}

import { activityTypeLabels } from "../../services/activitiesApi.js";
import { Tag } from "./Shared.jsx";

export function ActivityPreview({ activity }) {
  if (!activity) {
    return null;
  }

  return (
    <div className="student-preview-card activity-preview-card">
      <div>
        <Tag tone="blue">{activityTypeLabels[activity.type]}</Tag>
        <Tag tone="gold">{activity.skill}</Tag>
      </div>
      <strong>{activity.title}</strong>
      <p>{activity.content.question || activity.content.prompt || activity.content.sentence}</p>
      {activity.type === "multiple_choice" && (
        <div className="preview-options">
          {activity.content.options.map((option) => <span key={option}>{option}</span>)}
        </div>
      )}
      {activity.type === "matching" && (
        <div className="preview-options">
          {activity.content.pairs.map((pair) => <span key={pair.left}>{pair.left} to match item</span>)}
        </div>
      )}
      <small>{activity.feedback?.revision || activity.feedback?.wrong}</small>
    </div>
  );
}

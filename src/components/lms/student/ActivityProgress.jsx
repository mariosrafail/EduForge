import { CheckCircle2 } from "lucide-react";
import { Progress } from "../Shared.jsx";

export function ActivityProgress({ activities, activeIndex, completedIds, onSelectActivity }) {
  const total = activities.length;
  const progressValue = Math.round(((activeIndex + 1) / total) * 100);

  return (
    <div className="activity-flow-progress">
      <div className="flow-progress-top">
        <strong>Activity {activeIndex + 1} of {total}</strong>
        <span>{progressValue}% through lesson</span>
      </div>
      <Progress value={progressValue} color="linear-gradient(90deg, #f97316, #0b1f3a)" />
      <div className="activity-stepper" aria-label="Activity progress">
        {activities.map((activity, index) => {
          const isComplete = completedIds.has(activity.id);
          const isCurrent = index === activeIndex;
          return (
            <button
              key={activity.id}
              type="button"
              data-sound-click="nextActivity"
              className={`${isCurrent ? "current" : ""} ${isComplete ? "complete" : ""}`}
              onClick={() => onSelectActivity(index)}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span>{isComplete ? <CheckCircle2 size={15} /> : index + 1}</span>
              <b>{activity.title}</b>
            </button>
          );
        })}
      </div>
    </div>
  );
}

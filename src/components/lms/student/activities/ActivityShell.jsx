import { forwardRef } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";

export const ActivityShell = forwardRef(function ActivityShell({ activity, index, submitted, resultSummary, children }, ref) {
  return (
    <section ref={ref} className={`course-activity ${submitted ? "is-submitted" : ""}`}>
      <div className="activity-shell-header">
        <div>
          <span className="activity-number">Activity {index + 1}</span>
          <h2>{activity.instruction}</h2>
        </div>
        {submitted && (
          <span className={resultSummary.correct === resultSummary.total ? "activity-status good" : "activity-status review"}>
            {resultSummary.correct === resultSummary.total ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
            {resultSummary.correct}/{resultSummary.total}
          </span>
        )}
      </div>
      {children}
    </section>
  );
});

import { CheckCircle2, RotateCcw, StepForward } from "lucide-react";

export function ActivityFeedback({ score, guidance, isFinal, onTryAgain, onNext }) {
  return (
    <div className="activity-feedback-panel">
      <div>
        <CheckCircle2 size={19} />
        <div>
          <strong>Score: {score.correct}/{score.total}</strong>
          <p>
            {score.correct === score.total
              ? "All answers are correct. Move to the next activity when you are ready."
              : guidance || "Review the highlighted items. Correct answers stay locked, so use the guidance before trying again."}
          </p>
        </div>
      </div>
      <div className="lesson-actions">
        <button className="secondary-action" data-sound-ignore="true" onClick={onTryAgain}><RotateCcw size={17} /> Try again</button>
        <button className="primary-action" data-sound-ignore="true" onClick={onNext}>
          <StepForward size={17} /> {isFinal ? "Finish lesson" : "Next activity"}
        </button>
      </div>
    </div>
  );
}

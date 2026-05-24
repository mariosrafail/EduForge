import { useSoundEffects } from "../../../../context/SoundContext.jsx";

export function MultipleChoiceActivity({ activity, answers, onChange, submitted, resultMap = {} }) {
  const { playSound } = useSoundEffects();
  const selectOption = (questionId, option) => {
    if (!submitted) {
      playSound("clickConfirm");
      onChange({ ...answers, [questionId]: option });
    }
  };

  return (
    <div className="mc-activity">
      {activity.questions.map((question, index) => {
        const result = resultMap[question.id];
        const feedbackText = result?.correct
          ? activity.feedback?.correct || "Good job. You chose the correct answer."
          : activity.feedback?.wrong || "Use the sentence context before choosing the answer.";
        return (
          <article key={question.id} className={submitted && result ? (result.correct ? "correct" : "incorrect") : ""}>
            <strong>{index + 1}. {question.prompt}</strong>
            <div className="mc-options" role="radiogroup" aria-label={question.prompt}>
              {question.options.map((option, optionIndex) => {
                const selected = answers[question.id] === option;
                const optionState = submitted && selected && result ? (result.correct ? "correct" : "incorrect") : "";
                return (
                  <button
                    key={`${question.id}-${optionIndex}`}
                    type="button"
                    data-sound-ignore="true"
                    className={`mc-option-card ${selected ? "selected" : ""} ${optionState}`}
                    role="radio"
                    aria-checked={selected}
                    disabled={submitted}
                    onClick={() => selectOption(question.id, option)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectOption(question.id, option);
                      }
                    }}
                  >
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
            {submitted && result && (
              <div className={`item-feedback-box ${result.correct ? "correct" : "wrong"}`}>
                {feedbackText}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

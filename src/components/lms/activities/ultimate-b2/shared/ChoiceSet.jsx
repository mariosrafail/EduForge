import { InlineBlankPrompt } from "../../InlineBlankPrompt.jsx";

export function ChoiceSet({ questions, answers, setAnswers, disabled = false, submittedRows = null }) {
  const submittedById = Object.fromEntries((submittedRows || []).map((row) => [row.id, row]));

  return (
    <div className="ultimate-question-list">
      {questions.map((question, index) => {
        const prompt = question.question || question.prompt;
        const submitted = submittedById[question.id];
        const selectedAnswer = answers[question.id] || submitted?.studentAnswer || "";

        return (
          <fieldset key={question.id} className="ultimate-question-card" disabled={disabled}>
            <legend>
              <span>{index + 1}. </span>
              <InlineBlankPrompt
                prompt={prompt}
                selectedAnswer={selectedAnswer}
                submitted={Boolean(submitted)}
                isCorrect={Boolean(submitted?.correct)}
              />
            </legend>
            {Array.isArray(question.options) && question.options.length > 0 ? (
              question.options.map((option) => (
                <label key={option} className={answers[question.id] === option ? "selected" : ""}>
                  <input
                    type="radio"
                    name={question.id}
                    checked={answers[question.id] === option}
                    onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                  />
                  <span>{option}</span>
                </label>
              ))
            ) : (
              <label>
                <span className="sr-only">Answer</span>
                <input
                  type="text"
                  value={answers[question.id] || ""}
                  placeholder="Type your answer"
                  onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                />
              </label>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

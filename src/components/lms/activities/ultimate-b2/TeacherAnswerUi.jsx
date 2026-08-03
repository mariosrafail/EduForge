export function TeacherPresentationControls({ solutionsLoading, solutions, revealedCount, onCheck, onReset, onRevealAll, onHide }) {
  return (
    <div className="teacher-presentation-answer-controls" aria-label="Presentation answer controls">
      <button className="primary-action" type="button" onClick={onCheck} disabled={solutionsLoading || Boolean(solutions && solutions.solutionAvailability !== "explicit")}>{solutionsLoading ? "Loading solutions…" : "Check"}</button>
      <button className="secondary-action" type="button" onClick={onReset}>Reset</button>
      <button className="secondary-action" type="button" onClick={onRevealAll} disabled={solutionsLoading || solutions?.solutionAvailability !== undefined && solutions.solutionAvailability !== "explicit"}>Show all answers</button>
      <button className="secondary-action" type="button" onClick={onHide} disabled={!revealedCount}>Hide answers</button>
    </div>
  );
}

export function TeacherQuestionFeedback({ capabilities, question, checkResult, revealed, solutions, solutionsLoading, revealQuestion }) {
  if (!capabilities.canRevealSolutions) return null;
  return (
    <>
      <span className="presentation-question-actions">
        <button className="secondary-action compact-action" type="button" disabled={solutionsLoading || Boolean(solutions && !solutions.questions?.[question.id])} onClick={() => revealQuestion(question.id)}>Show answer</button>
        {checkResult && <b className={`presentation-check-result ${checkResult}`}>{checkResult === "correct" ? "Correct" : checkResult === "incorrect" ? "Try again" : "No answer"}</b>}
      </span>
      {revealed && solutions?.questions?.[question.id] && <span className="presentation-revealed-answer"><small>Publisher answer</small><strong>{solutions.questions[question.id].acceptedAnswers.join(" / ")}</strong></span>}
    </>
  );
}

export function TeacherLegacyQuestionFeedback({ capabilities, question, checkResult, revealed, solutions, solutionsLoading, revealQuestion }) {
  if (!capabilities.canRevealSolutions) return null;
  return (
    <div className="legacy-pilot-question-feedback">
      <button className="legacy-pilot-small-button" type="button" disabled={solutionsLoading || Boolean(solutions && !solutions.questions?.[question.id])} onClick={() => revealQuestion(question.id)}>Show answer</button>
      {checkResult && <b className={`legacy-pilot-result legacy-pilot-result--${checkResult}`}>{checkResult === "correct" ? "Correct" : checkResult === "incorrect" ? "Try again" : "No answer"}</b>}
      {revealed && solutions?.questions?.[question.id] && <div className="legacy-pilot-revealed-answer"><small>Publisher answer</small><strong>{solutions.questions[question.id].acceptedAnswers.join(" / ")}</strong></div>}
    </div>
  );
}

export function TeacherLegacyUnitOpenerAnswer({ index, revealed, modelAnswer, solutionsLoading, revealQuestion, questionId }) {
  return (
    <button type="button" className={`legacy-unit-opener-answer-lines ${revealed ? "revealed" : ""}`} aria-label={revealed ? `Publisher model answer for question ${index + 1}` : `Show publisher model answer for question ${index + 1}`} disabled={solutionsLoading} onClick={() => revealQuestion(questionId)}>
      {revealed ? <span>{modelAnswer}</span> : <span aria-hidden="true" />}
    </button>
  );
}

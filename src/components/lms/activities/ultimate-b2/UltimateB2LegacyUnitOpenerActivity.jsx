import { ultimateB2Unit1LegacyOpenerImages } from "../../../../data/ultimate-b2/unit1Part1LegacyOpenerAssets.js";

export function UltimateB2LegacyUnitOpenerActivity({
  activity,
  capabilities,
  answers,
  frozen,
  updateAnswer,
  revealedQuestionIds,
  solutions,
  solutionsLoading,
  revealQuestion,
  actions,
}) {
  const questions = activity.runtime?.questions || [];

  return (
    <section className="ultimate-b2-legacy-unit-opener" data-legacy-unit-opener-activity={activity.stableNormalizedId}>
      <div className="legacy-unit-opener-paper">
        <img className="legacy-unit-opener-instruction" src={ultimateB2Unit1LegacyOpenerImages.instructionArtwork} alt={activity.visibleInstructionText} />
        <div className="legacy-unit-opener-layout">
          <div className="legacy-unit-opener-questions">
            {questions.map((question, index) => {
              const revealed = revealedQuestionIds.includes(question.id);
              const modelAnswer = solutions?.questions?.[question.id]?.acceptedAnswers?.[0] || "";
              return (
                <article className={`legacy-unit-opener-question question-${index + 1}`} key={question.id}>
                  <h3><span>{index + 1}</span>{question.prompt}</h3>
                  {capabilities.canEditAnswers && !capabilities.isPresentation ? (
                    <textarea
                      aria-label={`Answer question ${index + 1}`}
                      value={answers[question.id] || ""}
                      disabled={frozen}
                      onChange={(event) => updateAnswer(question.id, event.target.value)}
                    />
                  ) : capabilities.canRevealSolutions ? (
                    <button
                      type="button"
                      className={`legacy-unit-opener-answer-lines ${revealed ? "revealed" : ""}`}
                      aria-label={revealed ? `Publisher model answer for question ${index + 1}` : `Show publisher model answer for question ${index + 1}`}
                      disabled={solutionsLoading}
                      onClick={() => revealQuestion(question.id)}
                    >
                      {revealed ? <span>{modelAnswer}</span> : <span aria-hidden="true" />}
                    </button>
                  ) : (
                    <div className="legacy-unit-opener-answer-lines" aria-hidden="true"><span /></div>
                  )}
                </article>
              );
            })}
          </div>
          <img className="legacy-unit-opener-quote-art" src={ultimateB2Unit1LegacyOpenerImages.quoteArtwork} alt="Who said it? Film is art, theatre is life and television is furniture — Kenny Leon" />
        </div>
      </div>
      {actions}
    </section>
  );
}

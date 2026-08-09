import { getUltimateB2Page5OpenResponseAuthoring, resolveUltimateB2Page5Artwork } from "../../../../data/ultimate-b2/page5AuthoringData.js";
import { ResponseRegion } from "./ResponseRegion.jsx";
import fallbackQuoteArtwork from "../../../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj1/image_1.png";
import { TeacherLegacyUnitOpenerAnswer } from "virtual:teacher-answer-ui";

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
  authoring: authoringOverride = null,
}) {
  const authoring = authoringOverride || getUltimateB2Page5OpenResponseAuthoring(activity);
  const questions = authoring?.questions || activity.runtime?.questions || [];
  const instructionArtwork = resolveUltimateB2Page5Artwork(authoring?.visualCapabilities?.instructionImage) || null;
  const quoteArtwork = resolveUltimateB2Page5Artwork(authoring?.quoteArtworkBinding) || fallbackQuoteArtwork;

  return (
    <section className="ultimate-b2-legacy-unit-opener" data-legacy-unit-opener-activity={activity.stableNormalizedId}>
      <div className="legacy-unit-opener-paper">
        {instructionArtwork && <img className="legacy-unit-opener-instruction" src={instructionArtwork} alt={authoring?.instructionImageAlt || activity.visibleInstructionText} />}
        <div className="legacy-unit-opener-layout">
          <div className="legacy-unit-opener-questions">
            {questions.map((question, index) => {
              const revealed = revealedQuestionIds?.includes(question.id) || false;
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
                  ) : capabilities.canRevealSolutions && !question.responseRegion?.area ? (
                    <TeacherLegacyUnitOpenerAnswer index={index} revealed={revealed} modelAnswer={modelAnswer} solutionsLoading={solutionsLoading} revealQuestion={revealQuestion} questionId={question.id} />
                  ) : (
                    <div className={`legacy-unit-opener-answer-lines ${question.responseRegion?.area ? "is-region-managed" : ""}`} aria-hidden="true"><span /></div>
                  )}
                </article>
              );
            })}
          </div>
          <img className="legacy-unit-opener-quote-art" src={quoteArtwork} alt="Who said it? Film is art, theatre is life and television is furniture — Kenny Leon" />
        </div>
        {(authoringOverride || capabilities.canRevealSolutions) && questions.map((question) => {
          if (!question.responseRegion?.area) return null;
          const revealed = revealedQuestionIds?.includes(question.id) || false;
          const modelAnswer = solutions?.questions?.[question.id]?.acceptedAnswers?.[0] || "";
          return <ResponseRegion
            key={question.id}
            region={question.responseRegion}
            revealed={revealed}
            revealText={modelAnswer}
            onReveal={capabilities.canRevealSolutions ? () => revealQuestion(question.id) : null}
            disabled={solutionsLoading}
            className="legacy-unit-opener-response-region"
          />;
        })}
      </div>
      {actions}
    </section>
  );
}

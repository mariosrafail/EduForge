import { useEffect, useRef } from "react";

import { getUltimateB2Page5OpenResponseAuthoring, resolveUltimateB2Page5Artwork } from "../../../../data/ultimate-b2/page5AuthoringData.js";
import fallbackQuoteArtwork from "../../../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj1/image_1.png";
import { TeacherLegacyUnitOpenerAnswer } from "virtual:teacher-answer-ui";
import { ResponseRegion, sourceAreaStyle } from "./ResponseRegion.jsx";

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
  activityPresentation = null,
  resetReveals = null,
  revealAll = null,
}) {
  const authoring = authoringOverride || getUltimateB2Page5OpenResponseAuthoring(activity);
  const questions = authoring?.questions || activity.runtime?.questions || [];
  const instructionArtwork = resolveUltimateB2Page5Artwork(authoring?.visualCapabilities?.instructionImage) || null;
  const quoteArtwork = resolveUltimateB2Page5Artwork(authoring?.quoteArtworkBinding) || fallbackQuoteArtwork;
  const surface = authoring?.surface || { width: 1024, height: 582 };
  const lastCommandToken = useRef(null);
  const onStateChange = activityPresentation?.onStateChange;
  const revealableQuestions = questions.filter((question) => question.responseRegion?.area);
  const revealedCount = revealableQuestions.filter((question) => revealedQuestionIds?.includes(question.id)).length;

  useEffect(() => {
    const command = activityPresentation?.command;
    if (!command || command.token === lastCommandToken.current) return;
    lastCommandToken.current = command.token;
    if (command.type === "reset-activity") resetReveals?.();
    if (command.type === "show-all") revealAll?.();
    if (command.type === "show-next") {
      const next = revealableQuestions.find((question) => !revealedQuestionIds?.includes(question.id));
      if (next) revealQuestion(next.id);
    }
  }, [activityPresentation?.command, questions, revealAll, revealQuestion, resetReveals, revealedQuestionIds]);

  useEffect(() => {
    onStateChange?.({ view: "questions", panelIndex: 0, panelCount: 0, reveal: { supported: true, total: revealableQuestions.length, revealed: revealedCount, pristine: revealedCount === 0 } });
  }, [onStateChange, revealableQuestions.length, revealedCount]);

  return (
    <section className="ultimate-b2-legacy-unit-opener" data-legacy-unit-opener-activity={activity.stableNormalizedId}>
      <div className="legacy-unit-opener-paper is-publisher-canvas" data-source-canvas={`${surface.width}x${surface.height}`}>
        {instructionArtwork && <img className="legacy-unit-opener-instruction" style={sourceAreaStyle(authoring?.artwork?.instruction?.area, surface)} src={instructionArtwork} alt={authoring?.instructionImageAlt || activity.visibleInstructionText} />}
        <div className="legacy-unit-opener-questions">
          {questions.map((question, index) => {
            const revealed = revealedQuestionIds?.includes(question.id) || false;
            const modelAnswer = solutions?.questions?.[question.id]?.acceptedAnswers?.[0] || "";
            const promptStyle = question.promptStyle || {};
            return (
              <article
                className={`legacy-unit-opener-question question-${index + 1}`}
                style={{
                  ...sourceAreaStyle(question.promptArea, surface),
                  "--publisher-prompt-font-size": `${((promptStyle.fontSize || 21) / surface.width) * 100}cqw`,
                  "--publisher-prompt-font-family": `"${promptStyle.fontFamily || "Fira Sans"}"`,
                  color: promptStyle.color || "#000000",
                }}
                key={question.id}
              >
                <h3><span>{index + 1}</span>{question.prompt}</h3>
                {capabilities.canRevealSolutions && !question.responseRegion?.area ? (
                  <TeacherLegacyUnitOpenerAnswer index={index} revealed={revealed} modelAnswer={modelAnswer} solutionsLoading={solutionsLoading} revealQuestion={revealQuestion} questionId={question.id} />
                ) : null}
              </article>
            );
          })}
        </div>
        <img className="legacy-unit-opener-quote-art" style={sourceAreaStyle(authoring?.artwork?.quote?.area, surface)} src={quoteArtwork} alt="Who said it? Film is art, theatre is life and television is furniture — Kenny Leon" />
        {capabilities.canEditAnswers && !capabilities.isPresentation && questions.map((question, index) => <textarea
          key={question.id}
          className="legacy-unit-opener-authored-answer"
          style={sourceAreaStyle(question.responseRegion?.area, surface)}
          aria-label={`Answer question ${index + 1}`}
          value={answers[question.id] || ""}
          disabled={frozen}
          onChange={(event) => updateAnswer(question.id, event.target.value)}
        />)}
        {(authoringOverride || capabilities.canRevealSolutions) && questions.map((question) => {
          if (!question.responseRegion?.area) return null;
          const revealed = revealedQuestionIds?.includes(question.id) || false;
          const modelAnswer = solutions?.questions?.[question.id]?.acceptedAnswers?.[0] || "";
          return <ResponseRegion
            key={question.id}
            region={question.responseRegion}
            surface={surface}
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

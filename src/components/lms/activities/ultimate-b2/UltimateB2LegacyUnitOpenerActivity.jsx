import { useEffect, useRef } from "react";

import {
  getUltimateB2OpenResponseAuthoring,
  getUltimateB2OpenResponseArtworkLayers,
  resolveUltimateB2OpenResponseArtwork,
} from "../../../../data/ultimate-b2/openResponseAuthoringData.js";
import { TeacherLegacyUnitOpenerAnswer } from "virtual:teacher-answer-ui";
import { ResponseRegion, sourceAreaStyle } from "./ResponseRegion.jsx";

export function UltimateB2OpenResponseActivity({
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
  const authoring = authoringOverride || getUltimateB2OpenResponseAuthoring(activity);
  const questions = authoring?.questions || activity.runtime?.questions || [];
  const artworkLayers = getUltimateB2OpenResponseArtworkLayers(authoring);
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
      <div className="legacy-unit-opener-paper is-publisher-canvas" data-source-canvas={`${surface.width}x${surface.height}`} style={{ "--publisher-surface-width": surface.width, "--publisher-surface-height": surface.height }}>
        {artworkLayers.map((layer) => {
          const artwork = resolveUltimateB2OpenResponseArtwork(layer);
          if (!artwork) return null;
          const className = layer.legacyRole === "instruction" ? "legacy-unit-opener-instruction" : layer.legacyRole === "quote" ? "legacy-unit-opener-quote-art" : "legacy-unit-opener-artwork";
          return <img className={className} key={layer.id} style={sourceAreaStyle(layer.area, surface)} src={artwork} alt={layer.altText || ""} />;
        })}
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
                   textAlign: promptStyle.align || "left",
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
        {capabilities.canEditAnswers && !capabilities.isPresentation && questions.map((question, index) => <textarea
          key={question.id}
          className="legacy-unit-opener-authored-answer"
          style={sourceAreaStyle(question.responseRegion?.area, surface)}
          aria-label={`Answer question ${index + 1}`}
          value={answers[question.id] || ""}
          disabled={frozen}
          onChange={(event) => updateAnswer(question.id, event.target.value)}
        />)}
        {(authoringOverride || capabilities.canRevealSolutions) && questions.map((question, index) => {
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
            interactiveAriaLabel={`Show model response for question ${index + 1}`}
            disabled={solutionsLoading}
            className="legacy-unit-opener-response-region"
          />;
        })}
      </div>
      {actions}
    </section>
  );
}

export const UltimateB2LegacyUnitOpenerActivity = UltimateB2OpenResponseActivity;

import { useState } from "react";

import { selectNativeSingleChoiceResponse, updateNativeSingleChoiceVisualNavigation, visibleNativeSingleChoicePanelIndexes } from "../../data/native-activities/nativeSingleChoiceRuntime.js";
import { logicalAreaStyle } from "../builder-studio/stageGeometry.js";
import "./nativeSingleChoice.css";

function feedbackText(state) {
  if (state === "correct") return "Correct.";
  if (state === "incorrect") return "Try again.";
  return "";
}

function TextSingleChoice({ questions, responses, update, readOnly, disabledQuestionIds, optionStates }) {
  return questions.map((question, questionIndex) => <fieldset key={question.id} disabled={readOnly || disabledQuestionIds.has(question.id)}>
    <legend>{questionIndex + 1}. {question.prompt}</legend>
    {question.options.map((option) => {
      const selected = responses[question.id] === option.id;
      const answerState = optionStates[option.id];
      return <label key={option.id} data-answer-state={answerState || undefined}>
        <input type="radio" name={question.id} value={option.id} checked={selected} onChange={() => update(question.id, option.id)} />
        <span>{option.text}</span>
        {answerState ? <strong className="native-single-choice-feedback" role="status">{feedbackText(answerState)}</strong> : null}
      </label>;
    })}
  </fieldset>);
}

function VisualPanel({ panel, panelIndex, document, assetUrl, responses, update, readOnly, disabledQuestionIds, optionStates }) {
  const questions = document.parts[0].interaction.questions;
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const reference = document.assets.find((asset) => asset.slot === panel.backgroundAssetSlot);
  const panelQuestionIds = [...new Set(panel.hotspots.map((hotspot) => hotspot.questionId))];
  return <section className="native-single-choice-visual-panel" aria-labelledby={`${panel.id}-title`}>
    <h3 id={`${panel.id}-title`}>Panel {panelIndex + 1}</h3>
    <div className="native-single-choice-visual-stage" style={{ aspectRatio: `${panel.sourceWidth} / ${panel.sourceHeight}` }}>
      {reference ? <img src={assetUrl(reference.assetId)} alt="" /> : <p role="status">Panel background is unavailable.</p>}
      {panel.hotspots.map((hotspot) => {
        const question = questionById.get(hotspot.questionId);
        const option = question?.options.find((entry) => entry.id === hotspot.optionId);
        const selected = responses[hotspot.questionId] === hotspot.optionId;
        const answerState = optionStates[hotspot.optionId];
        const feedback = feedbackText(answerState);
        return <button
          key={hotspot.id}
          type="button"
          className="native-single-choice-hotspot"
          style={logicalAreaStyle(hotspot.area, { width: panel.sourceWidth, height: panel.sourceHeight })}
          aria-label={`${question?.prompt || "Question"}: ${option?.text || "Option"}`}
          aria-pressed={selected}
          data-selected={selected || undefined}
          data-answer-state={answerState || undefined}
          disabled={readOnly || disabledQuestionIds.has(hotspot.questionId)}
          onClick={() => update(hotspot.questionId, hotspot.optionId)}
        ><span className="native-single-choice-sr-only">{selected ? "Selected: " : "Select "}{option?.text || "option"}{feedback ? ` ${feedback}` : ""}</span></button>;
      })}
    </div>
    <div className="native-single-choice-sr-only">
      {panelQuestionIds.map((questionId) => {
        const question = questionById.get(questionId);
        return question ? <section key={question.id}><h4>{question.prompt}</h4><ul>{question.options.map((option) => <li key={option.id}>{option.text}</li>)}</ul></section> : null;
      })}
    </div>
  </section>;
}

function VisualSingleChoice({ document, assetUrl, responses, update, readOnly, disabledQuestionIds, optionStates }) {
  const panels = document.parts[0].interaction.presentation.panels;
  const [navigation, setNavigation] = useState({ panelIndex: 0, showAll: false });
  if (!panels.length) return <p role="status">No visual panels are available.</p>;
  const normalized = updateNativeSingleChoiceVisualNavigation(navigation, panels.length, "normalize");
  const visiblePanels = visibleNativeSingleChoicePanelIndexes(normalized, panels.length).map((index) => ({ panel: panels[index], index }));
  return <div className="native-single-choice-visual">
    <div className="native-single-choice-visual-navigation" role="group" aria-label="Visual panel navigation">
      <button type="button" aria-pressed={normalized.showAll} onClick={() => setNavigation((current) => updateNativeSingleChoiceVisualNavigation(current, panels.length, "toggle-all"))}>{normalized.showAll ? "Paged View" : "Show All"}</button>
      {!normalized.showAll ? <button type="button" disabled={normalized.panelIndex >= panels.length - 1} onClick={() => setNavigation((current) => updateNativeSingleChoiceVisualNavigation(current, panels.length, "next"))}>Next</button> : null}
      <span role="status">{normalized.showAll ? `Showing all ${panels.length} panels` : `Panel ${normalized.panelIndex + 1} of ${panels.length}`}</span>
    </div>
    <div className={normalized.showAll ? "native-single-choice-visual-panels is-show-all" : "native-single-choice-visual-panels"}>
      {visiblePanels.map(({ panel, index }) => panel ? <VisualPanel key={panel.id} panel={panel} panelIndex={index} document={document} assetUrl={assetUrl} responses={responses} update={update} readOnly={readOnly} disabledQuestionIds={disabledQuestionIds} optionStates={optionStates} /> : null)}
    </div>
  </div>;
}

export function NativeSingleChoicePresentation({
  document,
  assetUrl = () => "",
  responses: controlledResponses = null,
  initialResponses = null,
  onResponsesChange = null,
  onSelect = null,
  optionStates = {},
  disabledQuestionIds = new Set(),
  readOnly = false,
  className = "",
}) {
  const [localResponses, setLocalResponses] = useState(() => ({ ...(initialResponses || {}) }));
  const responses = controlledResponses && typeof controlledResponses === "object" ? controlledResponses : localResponses;
  const update = (questionId, optionId) => {
    if (readOnly || disabledQuestionIds.has(questionId)) return;
    const next = selectNativeSingleChoiceResponse(responses, questionId, optionId);
    if (controlledResponses === null) setLocalResponses(next);
    onResponsesChange?.(next);
    onSelect?.({ questionId, optionId, responses: next });
  };
  const interaction = document.parts[0].interaction;
  const presentationKind = interaction.presentation?.kind === "image-hotspot" ? "visual" : "text";
  return <div className={className} data-native-single-choice-presentation={presentationKind}>
    {presentationKind === "visual"
      ? <VisualSingleChoice document={document} assetUrl={assetUrl} responses={responses} update={update} readOnly={readOnly} disabledQuestionIds={disabledQuestionIds} optionStates={optionStates} />
      : <TextSingleChoice questions={interaction.questions} responses={responses} update={update} readOnly={readOnly} disabledQuestionIds={disabledQuestionIds} optionStates={optionStates} />}
  </div>;
}

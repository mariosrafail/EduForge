import { useCallback, useEffect, useRef, useState } from "react";

import { getUltimateB2ReadingExerciseAuthoring, resolveUltimateB2ReadingExerciseAsset } from "../../../../data/ultimate-b2/readingExerciseAuthoringData.js";
import { sourceAreaStyle } from "./ResponseRegion.jsx";
import { UltimateB2ScrollableTextImage } from "./UltimateB2ExerciseVisuals.jsx";
import "./ultimateB2ExerciseActivities.css";

export function UltimateB2CompleteSentencesActivity({ activity, authoring: authoringOverride = null, presentation = null }) {
  const authoring = authoringOverride || getUltimateB2ReadingExerciseAuthoring(activity);
  const [view, setView] = useState("questions");
  const [revealedBlankIds, setRevealedBlankIds] = useState([]);
  const lastCommandToken = useRef(null);
  const onStateChange = presentation?.onStateChange;
  const toggleText = useCallback(() => {
    if (!authoring?.visualCapabilities.showText.enabled) return;
    setView((current) => current === "questions" ? "text" : "questions");
  }, [authoring]);

  useEffect(() => {
    const command = presentation?.command;
    if (!command || command.token === lastCommandToken.current) return;
    lastCommandToken.current = command.token;
    if (command.type === "toggle-text") toggleText();
    if (command.type === "reset-activity") { setView("questions"); setRevealedBlankIds([]); }
    if (command.type === "show-all") { setView("questions"); setRevealedBlankIds(authoring?.blanks.map((blank) => blank.id) || []); }
    if (command.type === "show-next") {
      setView("questions");
      setRevealedBlankIds((current) => {
        const next = authoring?.blanks.find((blank) => !current.includes(blank.id));
        return next ? [...current, next.id] : current;
      });
    }
  }, [authoring?.blanks, presentation?.command, toggleText]);

  useEffect(() => {
    onStateChange?.({ view, panelIndex: 0, panelCount: 0, reveal: { supported: true, total: authoring?.blanks.length || 0, revealed: revealedBlankIds.length, pristine: view === "questions" && revealedBlankIds.length === 0 } });
  }, [authoring?.blanks.length, onStateChange, revealedBlankIds.length, view]);

  if (!authoring) return null;
  if (view === "text") return <UltimateB2ScrollableTextImage visualCapabilities={authoring.visualCapabilities} resolveAsset={resolveUltimateB2ReadingExerciseAsset} alt="The Netflix Effect reading text" />;

  const blankById = new Map(authoring.blanks.map((blank) => [blank.id, blank]));
  const instructionSource = resolveUltimateB2ReadingExerciseAsset(authoring.instruction.binding);
  return (
    <section className="ultimate-b2-complete-sentences" data-complete-sentences-activity={authoring.activityId} data-complete-sentences-view={view} data-source-canvas={`${authoring.surface.width}x${authoring.surface.height}`}>
      {instructionSource && <img className="ultimate-b2-exercise-instruction" style={sourceAreaStyle(authoring.instruction.area, authoring.surface)} src={instructionSource} alt="Complete the sentences with the correct form of the highlighted words in the text." draggable="false" />}
      <div className="ultimate-b2-complete-sentences-example" style={{ ...sourceAreaStyle(authoring.example.textArea, authoring.surface), fontFamily: `"${authoring.example.textStyle.fontFamily}", Arial, sans-serif`, fontSize: authoring.example.textStyle.fontSize, color: authoring.example.textStyle.color }}>
        <b>{authoring.example.number}</b>
        <span className="ultimate-b2-inline-blank" style={{ left: authoring.example.answerArea.x - authoring.example.textArea.x, width: authoring.example.answerArea.width, height: authoring.example.answerArea.height }} aria-hidden="true" />
        <span className="ultimate-b2-complete-sentence-after" style={{ left: authoring.example.answerArea.x + authoring.example.answerArea.width - authoring.example.textArea.x }}>{authoring.example.after}</span>
      </div>
      <strong className="ultimate-b2-complete-sentences-example-answer" style={{ ...sourceAreaStyle(authoring.example.answerArea, authoring.surface), fontFamily: `"${authoring.example.answerStyle.fontFamily}", Arial, sans-serif`, fontSize: authoring.example.answerStyle.fontSize, color: authoring.example.answerStyle.color }}>{authoring.example.answer}</strong>
      {authoring.sentences.map((sentence) => {
        const blank = blankById.get(sentence.blankId);
        const revealed = revealedBlankIds.includes(blank.id);
        const relativeBlank = { left: blank.area.x - sentence.textArea.x, top: blank.area.y - sentence.textArea.y };
        return (
          <div className="ultimate-b2-complete-sentence" key={sentence.id} data-sentence-id={sentence.id} style={{ ...sourceAreaStyle(sentence.textArea, authoring.surface), fontFamily: `"${sentence.textStyle.fontFamily}", Arial, sans-serif`, fontSize: sentence.textStyle.fontSize, color: sentence.textStyle.color }}>
            <b>{sentence.number}</b>
            {sentence.before && <span className="ultimate-b2-complete-sentence-before">{sentence.before}</span>}
            <span className="ultimate-b2-inline-blank" style={{ left: relativeBlank.left, top: relativeBlank.top, width: blank.area.width, height: blank.area.height }} aria-hidden="true" />
            {!sentence.continuationArea && <span className="ultimate-b2-complete-sentence-after" style={{ left: relativeBlank.left + blank.area.width }}>{sentence.after}</span>}
            {sentence.continuationArea && <span className="ultimate-b2-complete-sentence-continuation" style={{ left: sentence.continuationArea.x - sentence.textArea.x, top: sentence.continuationArea.y - sentence.textArea.y, width: sentence.continuationArea.width, height: sentence.continuationArea.height, fontFamily: `"${sentence.textStyle.fontFamily}", Arial, sans-serif`, fontSize: sentence.textStyle.fontSize }}>{sentence.after.trim()}</span>}
            <button
              type="button"
              className={revealed ? "revealed" : ""}
              data-blank-id={blank.id}
              style={{ left: relativeBlank.left, top: relativeBlank.top, width: blank.area.width, height: blank.area.height, color: revealed ? blank.style.color : "transparent", fontFamily: `"${blank.style.fontFamily}", "Fira Sans", Arial, sans-serif`, fontSize: blank.style.fontSize, textAlign: blank.style.align, lineHeight: `${blank.area.height}px` }}
              aria-label={revealed ? `${blank.label}: ${blank.revealedWord}` : `Reveal ${blank.label.toLowerCase()}`}
              aria-pressed={revealed}
              onClick={() => setRevealedBlankIds((current) => current.includes(blank.id) ? current : [...current, blank.id])}
            >{revealed ? blank.revealedWord : ""}</button>
          </div>
        );
      })}
    </section>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";

import { resolveUltimateB2ReadingExerciseAsset } from "../../../../data/ultimate-b2/readingExerciseAssets.js";
import { getUltimateB2ReadingExerciseRuntime } from "../../../../data/ultimate-b2/readingExerciseRuntimeData.js";
import { sourceAreaStyle } from "./ResponseRegion.jsx";
import { UltimateB2ScrollableTextImage } from "./UltimateB2ExerciseVisuals.jsx";
import "./ultimateB2ExerciseActivities.css";

function readingSolution(value) {
  return value?.readingSolution || (value?.solutionType === "complete-sentences" ? value : null);
}

const COMPLETE_SENTENCE_TARGET_HEIGHT = 40;

export function UltimateB2CompleteSentencesActivity({ activity, runtime: runtimeOverride = null, teacherSolution = null, requestTeacherSolution = null, presentation = null }) {
  const runtime = runtimeOverride || getUltimateB2ReadingExerciseRuntime(activity);
  const [view, setView] = useState("questions");
  const [revealedBlankIds, setRevealedBlankIds] = useState([]);
  const lastCommandToken = useRef(null);
  const onStateChange = presentation?.onStateChange;
  const toggleText = useCallback(() => {
    if (!runtime?.visualCapabilities.showText.enabled) return;
    setView((current) => current === "questions" ? "text" : "questions");
  }, [runtime]);

  const reveal = useCallback(async (blankIds) => {
    const solution = readingSolution(teacherSolution) || readingSolution(await requestTeacherSolution?.());
    if (!solution?.blanks) return;
    const available = blankIds.filter((blankId) => typeof solution.blanks[blankId] === "string");
    setRevealedBlankIds((current) => [...new Set([...current, ...available])]);
  }, [requestTeacherSolution, teacherSolution]);

  useEffect(() => {
    const command = presentation?.command;
    if (!command || command.token === lastCommandToken.current) return;
    lastCommandToken.current = command.token;
    if (command.type === "toggle-text") toggleText();
    if (command.type === "reset-activity") { setView("questions"); setRevealedBlankIds([]); }
    if (command.type === "show-all") { setView("questions"); void reveal(runtime?.blanks.map((blank) => blank.id) || []); }
    if (command.type === "show-next") {
      setView("questions");
      const next = runtime?.blanks.find((blank) => !revealedBlankIds.includes(blank.id));
      if (next) void reveal([next.id]);
    }
  }, [presentation?.command, reveal, revealedBlankIds, runtime?.blanks, toggleText]);

  useEffect(() => {
    onStateChange?.({ view, panelIndex: 0, panelCount: 0, reveal: { supported: true, total: runtime?.blanks.length || 0, revealed: revealedBlankIds.length, pristine: view === "questions" && revealedBlankIds.length === 0 } });
  }, [runtime?.blanks.length, onStateChange, revealedBlankIds.length, view]);

  if (!runtime) return null;
  if (view === "text") return <UltimateB2ScrollableTextImage visualCapabilities={runtime.visualCapabilities} resolveAsset={resolveUltimateB2ReadingExerciseAsset} alt="The Netflix Effect reading text" />;

  const solution = readingSolution(teacherSolution);
  const blankById = new Map(runtime.blanks.map((blank) => [blank.id, blank]));
  const instructionSource = resolveUltimateB2ReadingExerciseAsset(runtime.instruction.binding);
  return (
    <section className="ultimate-b2-complete-sentences" data-complete-sentences-activity={runtime.activityId} data-complete-sentences-view={view} data-source-canvas={`${runtime.surface.width}x${runtime.surface.height}`}>
      {instructionSource && <img className="ultimate-b2-exercise-instruction" style={sourceAreaStyle(runtime.instruction.area, runtime.surface)} src={instructionSource} alt="Complete the sentences with the correct form of the highlighted words in the text." draggable="false" />}
      <div className="ultimate-b2-complete-sentences-example" style={{ ...sourceAreaStyle(runtime.example.textArea, runtime.surface), fontFamily: `"${runtime.example.textStyle.fontFamily}", Arial, sans-serif`, fontSize: runtime.example.textStyle.fontSize, color: runtime.example.textStyle.color }}>
        <b>{runtime.example.number}</b>
        <span className="ultimate-b2-inline-blank" style={{ left: runtime.example.answerArea.x - runtime.example.textArea.x, width: runtime.example.answerArea.width, height: runtime.example.answerArea.height }} aria-hidden="true" />
        <span className="ultimate-b2-complete-sentence-after" style={{ left: runtime.example.answerArea.x + runtime.example.answerArea.width - runtime.example.textArea.x }}>{runtime.example.after}</span>
      </div>
      <strong className="ultimate-b2-complete-sentences-example-answer" style={{ ...sourceAreaStyle(runtime.example.answerArea, runtime.surface), fontFamily: `"${runtime.example.answerStyle.fontFamily}", Arial, sans-serif`, fontSize: runtime.example.answerStyle.fontSize, color: runtime.example.answerStyle.color }}>{runtime.example.exampleText}</strong>
      {runtime.sentences.map((sentence) => {
        const blank = blankById.get(sentence.blankId);
        const revealed = revealedBlankIds.includes(blank.id);
        const relativeBlank = { left: blank.area.x - sentence.textArea.x, top: blank.area.y - sentence.textArea.y };
        const targetHeight = Math.max(COMPLETE_SENTENCE_TARGET_HEIGHT, blank.area.height);
        const targetInset = (targetHeight - blank.area.height) / 2;
        return (
          <div className="ultimate-b2-complete-sentence" key={sentence.id} data-sentence-id={sentence.id} style={{ ...sourceAreaStyle(sentence.textArea, runtime.surface), fontFamily: `"${sentence.textStyle.fontFamily}", Arial, sans-serif`, fontSize: sentence.textStyle.fontSize, color: sentence.textStyle.color }}>
            <b>{sentence.number}</b>
            {sentence.before && <span className="ultimate-b2-complete-sentence-before">{sentence.before}</span>}
            <span className="ultimate-b2-inline-blank" data-blank-visual-id={blank.id} style={{ left: relativeBlank.left, top: relativeBlank.top, width: blank.area.width, height: blank.area.height }} aria-hidden="true" />
            {!sentence.continuationArea && <span className="ultimate-b2-complete-sentence-after" style={{ left: relativeBlank.left + blank.area.width }}>{sentence.after}</span>}
            {sentence.continuationArea && <span className="ultimate-b2-complete-sentence-continuation" style={{ left: sentence.continuationArea.x - sentence.textArea.x, top: sentence.continuationArea.y - sentence.textArea.y, width: sentence.continuationArea.width, height: sentence.continuationArea.height, fontFamily: `"${sentence.textStyle.fontFamily}", Arial, sans-serif`, fontSize: sentence.textStyle.fontSize }}>{sentence.after.trim()}</span>}
            <button
              type="button"
              className={revealed ? "revealed" : ""}
              data-blank-id={blank.id}
              style={{ left: relativeBlank.left, top: relativeBlank.top - targetInset, width: blank.area.width, height: targetHeight, color: revealed ? blank.style.color : "transparent" }}
              aria-label={revealed && solution?.blanks?.[blank.id] ? `${blank.label}: ${solution.blanks[blank.id]}` : `Reveal ${blank.label.toLowerCase()}`}
              aria-pressed={revealed}
              onClick={() => void reveal([blank.id])}
            >
              <span
                className="ultimate-b2-complete-sentence-answer"
                data-blank-answer-id={blank.id}
                style={{ top: targetInset, height: blank.area.height, fontFamily: `"${blank.style.fontFamily}", "Fira Sans", Arial, sans-serif`, fontSize: blank.style.fontSize, textAlign: blank.style.align, lineHeight: `${blank.area.height}px` }}
              >{revealed ? solution?.blanks?.[blank.id] || "" : ""}</span>
            </button>
          </div>
        );
      })}
    </section>
  );
}

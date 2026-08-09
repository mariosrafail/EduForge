import { useCallback, useEffect, useRef, useState } from "react";

import { getUltimateB2ReadingExerciseAuthoring, resolveUltimateB2ReadingExerciseAsset } from "../../../../data/ultimate-b2/readingExerciseAuthoringData.js";
import { UltimateB2InstructionImage, UltimateB2ScrollableTextImage } from "./UltimateB2ExerciseVisuals.jsx";
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
  }, [presentation?.command, toggleText]);

  useEffect(() => {
    onStateChange?.({ view, panelIndex: 0, panelCount: 0 });
  }, [onStateChange, view]);

  if (!authoring) return null;
  if (view === "text") return <UltimateB2ScrollableTextImage visualCapabilities={authoring.visualCapabilities} resolveAsset={resolveUltimateB2ReadingExerciseAsset} alt="The Netflix Effect reading text" />;

  const blankById = new Map(authoring.blanks.map((blank) => [blank.id, blank]));
  return (
    <section className="ultimate-b2-complete-sentences" data-complete-sentences-activity={authoring.activityId} data-complete-sentences-view={view}>
      <UltimateB2InstructionImage visualCapabilities={authoring.visualCapabilities} resolveAsset={resolveUltimateB2ReadingExerciseAsset} alt="Complete the sentences with the correct form of the highlighted words in the text." />
      <div className="ultimate-b2-complete-sentences-example" style={{ top: 92 }}>
        <b>{authoring.example.number}</b><span>{authoring.example.before}</span><strong>{authoring.example.answer}</strong><span>{authoring.example.after}</span>
      </div>
      {authoring.sentences.map((sentence) => {
        const blank = blankById.get(sentence.blankId);
        const revealed = revealedBlankIds.includes(blank.id);
        return (
          <div className={`ultimate-b2-complete-sentence ${sentence.number === 7 ? "ultimate-b2-complete-sentence--long" : ""}`} key={sentence.id} style={{ top: blank.area.y - 1, fontSize: sentence.number === 7 ? 16 : undefined }}>
            <b>{sentence.number}</b><span>{sentence.before}</span><span className="ultimate-b2-inline-blank" style={{ width: blank.area.width }} aria-hidden="true" /><span>{sentence.after}</span>
            <button
              type="button"
              className={revealed ? "revealed" : ""}
              style={{ left: blank.area.x - 57, top: -8, width: blank.area.width, height: Math.max(44, blank.area.height), fontSize: sentence.number === 7 ? 16 : undefined }}
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

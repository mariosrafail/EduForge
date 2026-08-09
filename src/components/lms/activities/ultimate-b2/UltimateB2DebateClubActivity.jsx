import { useCallback, useEffect, useRef, useState } from "react";

import { getUltimateB2ReadingExerciseAuthoring, resolveUltimateB2ReadingExerciseAsset } from "../../../../data/ultimate-b2/readingExerciseAuthoringData.js";
import { UltimateB2InstructionImage } from "./UltimateB2ExerciseVisuals.jsx";
import "./ultimateB2ExerciseActivities.css";

export function UltimateB2DebateClubActivity({ activity, authoring: authoringOverride = null, presentation = null }) {
  const authoring = authoringOverride || getUltimateB2ReadingExerciseAuthoring(activity);
  const [partIndex, setPartIndex] = useState(0);
  const [revealedPartIds, setRevealedPartIds] = useState([]);
  const lastCommandToken = useRef(null);
  const onStateChange = presentation?.onStateChange;
  const movePart = useCallback((delta) => {
    if (!authoring) return;
    setPartIndex((current) => Math.max(0, Math.min(authoring.parts.length - 1, current + delta)));
  }, [authoring]);

  useEffect(() => {
    const command = presentation?.command;
    if (!command || command.token === lastCommandToken.current) return;
    lastCommandToken.current = command.token;
    if (command.type === "previous-panel") movePart(-1);
    if (command.type === "next-panel") movePart(1);
  }, [movePart, presentation?.command]);

  useEffect(() => {
    onStateChange?.({ view: "questions", panelIndex: partIndex, panelCount: authoring?.parts.length || 0 });
  }, [authoring?.parts.length, onStateChange, partIndex]);

  if (!authoring) return null;
  const part = authoring.parts[partIndex];
  const revealed = revealedPartIds.includes(part.id);
  return (
    <section className="ultimate-b2-debate-club" data-debate-club-activity={authoring.activityId} data-debate-part={part.number}>
      <img className="ultimate-b2-debate-badge" src={resolveUltimateB2ReadingExerciseAsset(authoring.badgeImage)} alt="Debate club" draggable="false" />
      <UltimateB2InstructionImage visualCapabilities={authoring.visualCapabilities} resolveAsset={resolveUltimateB2ReadingExerciseAsset} alt="Discuss the question, use the ideas given, and present your arguments." />
      <h2>{part.prompt}</h2>
      <img className="ultimate-b2-debate-part-image" src={resolveUltimateB2ReadingExerciseAsset(part.partImage)} alt={part.partImageAlt} draggable="false" />
      <img className="ultimate-b2-debate-argument-image" src={resolveUltimateB2ReadingExerciseAsset(part.argumentImage)} alt="" aria-hidden="true" draggable="false" />
      <button
        type="button"
        className={`ultimate-b2-debate-hotspot ${revealed ? "revealed" : ""}`}
        style={{ left: part.hotspot.area.x, top: part.hotspot.area.y, width: part.hotspot.area.width, height: part.hotspot.area.height }}
        aria-label={part.hotspot.ariaLabel}
        aria-pressed={revealed}
        onClick={() => setRevealedPartIds((current) => current.includes(part.id) ? current : [...current, part.id])}
      ><span>{revealed ? part.hotspot.revealText : ""}</span></button>
    </section>
  );
}

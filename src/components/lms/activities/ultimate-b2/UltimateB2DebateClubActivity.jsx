import { useCallback, useEffect, useRef, useState } from "react";

import { getUltimateB2ReadingExerciseAuthoring, resolveUltimateB2ReadingExerciseAsset } from "../../../../data/ultimate-b2/readingExerciseAuthoringData.js";
import { ResponseRegion, sourceAreaStyle } from "./ResponseRegion.jsx";
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
    if (command.type === "reset-activity") { setPartIndex(0); setRevealedPartIds([]); }
    if (command.type === "show-all") setRevealedPartIds(authoring?.parts.map((part) => part.id) || []);
    if (command.type === "show-next") {
      const nextIndex = authoring?.parts.findIndex((part) => !revealedPartIds.includes(part.id)) ?? -1;
      if (nextIndex >= 0) {
        setPartIndex(nextIndex);
        setRevealedPartIds((current) => current.includes(authoring.parts[nextIndex].id) ? current : [...current, authoring.parts[nextIndex].id]);
      }
    }
  }, [authoring?.parts, movePart, presentation?.command, revealedPartIds]);

  useEffect(() => {
    onStateChange?.({ view: "questions", panelIndex: partIndex, panelCount: authoring?.parts.length || 0, reveal: { supported: true, total: authoring?.parts.length || 0, revealed: revealedPartIds.length, pristine: partIndex === 0 && revealedPartIds.length === 0 } });
  }, [authoring?.parts.length, onStateChange, partIndex, revealedPartIds.length]);

  if (!authoring) return null;
  const part = authoring.parts[partIndex];
  const revealed = revealedPartIds.includes(part.id);
  const artwork = (item, className, alt = "") => item.parts.includes(part.number) ? <img className={className} style={sourceAreaStyle(item.area, authoring.surface)} src={resolveUltimateB2ReadingExerciseAsset(item.binding)} alt={alt} draggable="false" /> : null;
  return (
    <section className="ultimate-b2-debate-club" data-debate-club-activity={authoring.activityId} data-debate-part={part.number}>
      {artwork(authoring.artwork.badge, "ultimate-b2-debate-badge", "Debate club")}
      {authoring.visualCapabilities.instructionImage && artwork(authoring.artwork.instruction, "ultimate-b2-exercise-instruction", authoring.instructionImageAlt)}
      {part.promptArea && <h2 style={{ ...sourceAreaStyle(part.promptArea, authoring.surface), "--debate-prompt-font-family": `"${part.promptStyle.fontFamily}"`, "--debate-prompt-font-size": `${part.promptStyle.fontSize / authoring.surface.width * 100}cqw`, "--debate-prompt-color": part.promptStyle.color }}>{part.prompt}</h2>}
      {artwork(part.visualObjects.photo, "ultimate-b2-debate-part-image", part.partImageAlt)}
      {artwork(part.visualObjects.argument, "ultimate-b2-debate-argument-image")}
      <ResponseRegion
        region={part.responseRegion}
        surface={authoring.surface}
        revealed={revealed}
        revealText={part.responseRegion.revealText}
        onReveal={() => setRevealedPartIds((current) => current.includes(part.id) ? current : [...current, part.id])}
        className="ultimate-b2-debate-response-region"
      />
    </section>
  );
}

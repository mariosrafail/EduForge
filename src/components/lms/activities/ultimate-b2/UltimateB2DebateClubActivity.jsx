import { useCallback, useEffect, useRef, useState } from "react";

import { resolveUltimateB2ReadingExerciseAsset } from "../../../../data/ultimate-b2/readingExerciseAssets.js";
import { getUltimateB2ReadingExerciseRuntime } from "../../../../data/ultimate-b2/readingExerciseRuntimeData.js";
import { ResponseRegion, responseRegionStyle, sourceAreaStyle } from "./ResponseRegion.jsx";
import "./ultimateB2ExerciseActivities.css";

function readingSolution(value) {
  return value?.readingSolution || (value?.solutionType === "publisher-model-response" ? value : null);
}

export function UltimateB2DebateClubActivity({
  activity,
  runtime: runtimeOverride = null,
  teacherPresentation = false,
  teacherSolution = null,
  requestTeacherSolution = null,
  presentation = null,
  studentSubmission = null,
}) {
  const runtime = runtimeOverride || getUltimateB2ReadingExerciseRuntime(activity);
  const [partIndex, setPartIndex] = useState(0);
  const [revealedPartIds, setRevealedPartIds] = useState([]);
  const lastCommandToken = useRef(null);
  const onStateChange = presentation?.onStateChange;
  const movePart = useCallback((delta) => {
    if (!runtime) return;
    setPartIndex((current) => Math.max(0, Math.min(runtime.parts.length - 1, current + delta)));
  }, [runtime]);

  const reveal = useCallback(async (partIds) => {
    const solution = readingSolution(teacherSolution) || readingSolution(await requestTeacherSolution?.());
    if (!solution?.parts) return;
    const available = partIds.filter((partId) => typeof solution.parts[partId] === "string");
    setRevealedPartIds((current) => [...new Set([...current, ...available])]);
  }, [requestTeacherSolution, teacherSolution]);

  useEffect(() => {
    const command = presentation?.command;
    if (!command || command.token === lastCommandToken.current) return;
    lastCommandToken.current = command.token;
    if (command.type === "previous-panel") movePart(-1);
    if (command.type === "next-panel") movePart(1);
    if (command.type === "reset-activity") { setPartIndex(0); setRevealedPartIds([]); }
    if (command.type === "show-all") void reveal(runtime?.parts.map((part) => part.id) || []);
    if (command.type === "show-next") {
      const nextIndex = runtime?.parts.findIndex((part) => !revealedPartIds.includes(part.id)) ?? -1;
      if (nextIndex >= 0) {
        setPartIndex(nextIndex);
        void reveal([runtime.parts[nextIndex].id]);
      }
    }
  }, [movePart, presentation?.command, reveal, revealedPartIds, runtime?.parts]);

  useEffect(() => {
    onStateChange?.({ view: "questions", panelIndex: partIndex, panelCount: runtime?.parts.length || 0, reveal: teacherPresentation ? { supported: true, total: runtime?.parts.length || 0, revealed: revealedPartIds.length, pristine: partIndex === 0 && revealedPartIds.length === 0 } : null });
  }, [runtime?.parts.length, onStateChange, partIndex, revealedPartIds.length, teacherPresentation]);

  if (!runtime) return null;
  const part = runtime.parts[partIndex];
  const revealed = revealedPartIds.includes(part.id);
  const solution = readingSolution(teacherSolution);
  const responseQuestionId = activity?.runtime?.questions?.[0]?.id || `${runtime.activityId}-q1`;
  const responseValue = studentSubmission?.answers?.[responseQuestionId] || "";
  const artwork = (item, className, alt = "") => item.parts.includes(part.number) ? <img className={className} style={sourceAreaStyle(item.area, runtime.surface)} src={resolveUltimateB2ReadingExerciseAsset(item.binding)} alt={alt} draggable="false" /> : null;
  return (
    <section className="ultimate-b2-debate-club" data-debate-club-activity={runtime.activityId} data-debate-part={part.number} data-student-response={teacherPresentation ? undefined : "enabled"}>
      {artwork(runtime.artwork.badge, "ultimate-b2-debate-badge", "Debate club")}
      {runtime.visualCapabilities.instructionImage && artwork(runtime.artwork.instruction, "ultimate-b2-exercise-instruction", runtime.instructionImageAlt)}
      {part.promptArea && <h2 style={{ ...sourceAreaStyle(part.promptArea, runtime.surface), "--debate-prompt-font-family": `"${part.promptStyle.fontFamily}"`, "--debate-prompt-font-size": `${part.promptStyle.fontSize / runtime.surface.width * 100}cqw`, "--debate-prompt-color": part.promptStyle.color }}>{part.prompt}</h2>}
      {artwork(part.visualObjects.photo, "ultimate-b2-debate-part-image", part.partImageAlt)}
      {artwork(part.visualObjects.argument, "ultimate-b2-debate-argument-image")}
      {teacherPresentation ? <ResponseRegion
        region={part.responseRegion}
        surface={runtime.surface}
        revealed={revealed}
        revealText={solution?.parts?.[part.id] || ""}
        onReveal={() => void reveal([part.id])}
        className="ultimate-b2-debate-response-region"
      /> : <textarea
        className="ultimate-b2-debate-student-response"
        style={responseRegionStyle(part.responseRegion, runtime.surface)}
        aria-label={part.responseRegion.ariaLabel}
        value={responseValue}
        disabled={studentSubmission?.frozen}
        onChange={(event) => studentSubmission?.replaceAnswers?.((current) => ({ ...(current || {}), [responseQuestionId]: event.target.value }))}
      />}
      {!teacherPresentation && <nav className="ultimate-b2-debate-student-controls" aria-label="Debate Club parts and submission">
        <button type="button" disabled={partIndex === 0} onClick={() => movePart(-1)}>Previous part</button>
        <button type="button" disabled={partIndex >= runtime.parts.length - 1} onClick={() => movePart(1)}>Next part</button>
        {!studentSubmission?.submitted && <button type="button" disabled={!responseValue.trim() || studentSubmission?.frozen || studentSubmission?.submitting} onClick={() => studentSubmission?.onSubmit?.()}>{studentSubmission?.submitting ? "Submitting…" : "Done"}</button>}
        {studentSubmission?.submitted && <strong>Submitted</strong>}
      </nav>}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";

import { logicalAreaStyle } from "../builder-studio/stageGeometry.js";
import { NativeAudioTextHotspotButtons } from "../native-readable-text/NativeAudioTextHotspots.jsx";
import { nativeCompleteSentencesPromptParts, updateNativeCompleteSentencesRevealState } from "../../data/native-activities/nativeCompleteSentences.js";
import "./nativeCompleteSentences.css";

function SentencePrompt({ prompt }) {
  const parts = nativeCompleteSentencesPromptParts(prompt);
  return parts.structured ? <>{parts.before}<span className="native-complete-sentences-inline-blank" aria-label="blank">______</span>{parts.after}</> : prompt;
}

function Presentation({ document, assetUrl, responses, onChange, readOnly, revealed = new Set(), answers = new Map(), onTeacherReveal = null, audioHotspotPresentation = null }) {
  const interaction = document.parts[0].interaction;
  const presentation = interaction.presentation;
  const reference = document.assets.find((asset) => asset.slot === presentation.backgroundAssetSlot);
  return <article className="native-complete-sentences" aria-label={document.metadata.title}>
    <div className="native-complete-sentences-stage" style={{ aspectRatio: `${presentation.sourceWidth} / ${presentation.sourceHeight}`, "--native-complete-sentences-ratio": presentation.sourceWidth / presentation.sourceHeight }}>
      {reference ? <img src={assetUrl(reference.assetId)} alt="" /> : <p role="status">Background image is unavailable.</p>}
      {presentation.hotspots.map((hotspot, index) => {
        const item = interaction.items.find((candidate) => candidate.id === hotspot.itemId);
        const teacherAnswer = revealed.has(hotspot.itemId) ? answers.get(hotspot.itemId) || "" : null;
        if (onTeacherReveal) return <button
          key={hotspot.id}
          type="button"
          className="native-complete-sentences-blank native-complete-sentences-teacher-target"
          style={logicalAreaStyle(hotspot.area, { width: presentation.sourceWidth, height: presentation.sourceHeight })}
          data-revealed={teacherAnswer !== null || undefined}
          aria-label={`${teacherAnswer === null ? "Reveal" : "Revealed"} answer for sentence ${index + 1}`}
          onClick={() => onTeacherReveal(hotspot.itemId)}
        >
          <span className="native-complete-sentences-sr-only">{item?.prompt || `Sentence ${index + 1}`}</span>
          <span className="native-complete-sentences-teacher-answer" aria-live="polite">{teacherAnswer ?? ""}</span>
        </button>;
        return <label key={hotspot.id} className="native-complete-sentences-blank" style={logicalAreaStyle(hotspot.area, { width: presentation.sourceWidth, height: presentation.sourceHeight })}>
          <span className="native-complete-sentences-sr-only">{item?.prompt || `Sentence ${index + 1}`}</span>
          <input type="text" value={teacherAnswer ?? responses[hotspot.itemId] ?? ""} readOnly={readOnly || teacherAnswer !== null} aria-label={`Answer for sentence ${index + 1}`} onChange={(event) => onChange?.(hotspot.itemId, event.target.value)} />
        </label>;
      })}
      <NativeAudioTextHotspotButtons panelId={null} surface={{ width: presentation.sourceWidth, height: presentation.sourceHeight }} presentation={audioHotspotPresentation} />
    </div>
    <ol className="native-complete-sentences-prompts">{interaction.items.map((item) => <li key={item.id}><SentencePrompt prompt={item.prompt} /></li>)}</ol>
  </article>;
}

export function NativeCompleteSentencesStudentSurface({ document, assetUrl = () => "", responses: controlled = null, initialResponses = null, onResponsesChange = null, readOnly = false, audioHotspotPresentation = null }) {
  const [local, setLocal] = useState(() => ({ ...(initialResponses || {}) }));
  const responses = controlled && typeof controlled === "object" ? controlled : local;
  const change = (itemId, value) => {
    if (readOnly) return;
    const next = { ...responses, [itemId]: value };
    if (controlled === null) setLocal(next);
    onResponsesChange?.(next);
  };
  return <Presentation document={document} assetUrl={assetUrl} responses={responses} onChange={change} readOnly={readOnly} audioHotspotPresentation={audioHotspotPresentation} />;
}

export function NativeCompleteSentencesTeacherSurface({ publicDocument, teacherDocument, assetUrl = () => "", presentation = null, audioHotspotPresentation = null }) {
  const itemIds = publicDocument.parts[0].interaction.items.map((item) => item.id);
  const answers = new Map(teacherDocument.parts[0].solution.answers.map((answer) => [answer.itemId, answer.text]));
  const [revealed, setRevealed] = useState(() => new Set());
  const lastToken = useRef(presentation?.command?.token);
  useEffect(() => {
    const command = presentation?.command;
    if (!command || command.token === lastToken.current) return;
    lastToken.current = command.token;
    setRevealed((current) => {
      return updateNativeCompleteSentencesRevealState(current, itemIds, command.type);
    });
  }, [itemIds.join("\0"), presentation?.command]);
  useEffect(() => presentation?.onStateChange?.({ panelIndex: 0, panelCount: 1, reveal: { supported: true, total: itemIds.length, revealed: revealed.size, pristine: revealed.size === 0 } }), [itemIds.length, presentation?.onStateChange, revealed]);
  return <Presentation document={publicDocument} assetUrl={assetUrl} responses={{}} readOnly revealed={revealed} answers={answers} onTeacherReveal={(itemId) => setRevealed((current) => updateNativeCompleteSentencesRevealState(current, itemIds, { itemId }))} audioHotspotPresentation={audioHotspotPresentation} />;
}

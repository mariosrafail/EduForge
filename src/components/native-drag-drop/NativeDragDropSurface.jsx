import { useEffect, useMemo, useRef, useState } from "react";

import { logicalAreaStyle } from "../builder-studio/stageGeometry.js";
import {
  normalizeNativeDragDropResponses,
  placeNativeDragDropWord,
  removeNativeDragDropResponse,
} from "../../data/native-activities/nativeDragDrop.js";
import "./nativeDragDrop.css";

function PanelArtwork({ document, panel, assetUrl, children }) {
  const slotRef = useRef(null);
  const [containedSize, setContainedSize] = useState(null);
  const assets = new Map(document.assets.map((asset) => [asset.slot, asset]));
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return undefined;
    const update = () => {
      const bounds = slot.getBoundingClientRect();
      const scale = Math.min(bounds.width / panel.surface.width, bounds.height / panel.surface.height);
      const next = scale > 0 ? { width: panel.surface.width * scale, height: panel.surface.height * scale } : null;
      setContainedSize((current) => current && next && Math.abs(current.width - next.width) < .25 && Math.abs(current.height - next.height) < .25 ? current : next);
    };
    update();
    if (typeof ResizeObserver === "undefined") { globalThis.addEventListener?.("resize", update); return () => globalThis.removeEventListener?.("resize", update); }
    const observer = new ResizeObserver(update); observer.observe(slot); return () => observer.disconnect();
  }, [panel.surface.height, panel.surface.width]);
  return <div className="native-drag-drop-stage-slot" ref={slotRef}><div className="native-drag-drop-stage" style={{ aspectRatio: `${panel.surface.width} / ${panel.surface.height}`, ...(containedSize || {}) }} data-surface-width={panel.surface.width} data-surface-height={panel.surface.height}>
    {panel.images.map((image) => {
      const reference = assets.get(image.assetSlot);
      return <div key={image.id} className="native-drag-drop-artwork" style={{ ...logicalAreaStyle(image.area, panel.surface), zIndex: image.order + 1 }}>
        {reference ? <img src={assetUrl(reference.assetId)} alt={image.decorative ? "" : image.altText} style={{ objectFit: image.fit }} /> : null}
      </div>;
    })}
    {children}
  </div></div>;
}

function PanelNavigation({ panels, panelIndex, setPanelIndex }) {
  if (panels.length < 2) return null;
  return <nav className="native-drag-drop-panel-navigation" aria-label="Activity panels">
    <button type="button" disabled={panelIndex === 0} onClick={() => setPanelIndex((current) => Math.max(0, current - 1))}>Previous</button>
    <span>Panel {panelIndex + 1} of {panels.length}</span>
    <button type="button" disabled={panelIndex === panels.length - 1} onClick={() => setPanelIndex((current) => Math.min(panels.length - 1, current + 1))}>Next</button>
  </nav>;
}

function closestDropTarget(clientX, clientY) {
  return globalThis.document?.elementFromPoint?.(clientX, clientY)?.closest?.("[data-drag-drop-target-id]")?.dataset?.dragDropTargetId || null;
}

export function NativeDragDropStudentSurface({
  document,
  assetUrl = () => "",
  responses: controlled = null,
  initialResponses = null,
  onResponsesChange = null,
  readOnly = false,
  evaluatePlacement = null,
  targetWordOverrides = null,
  onEmptyTargetActivate = null,
  panelIndex: controlledPanelIndex = null,
  onPanelIndexChange = null,
  presentation = null,
  resetToken = null,
  presentationMode = false,
}) {
  const interaction = document.parts[0].interaction;
  const [local, setLocal] = useState(() => normalizeNativeDragDropResponses(initialResponses, document));
  const [localPanelIndex, setLocalPanelIndex] = useState(0);
  const [selectedWordId, setSelectedWordId] = useState(null);
  const [draggingWordId, setDraggingWordId] = useState(null);
  const [incorrectTargetId, setIncorrectTargetId] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const suppressClickWordId = useRef(null);
  const lastResetToken = useRef(resetToken);
  const responses = useMemo(() => normalizeNativeDragDropResponses(controlled && typeof controlled === "object" ? controlled : local, document), [controlled, document, local]);
  const panelIndex = controlledPanelIndex ?? localPanelIndex;
  const panel = interaction.panels[panelIndex] || interaction.panels[0];
  const wordById = new Map(interaction.words.map((word) => [word.id, word]));
  const usedWordIds = new Set(Object.values(responses));
  const clearFeedback = () => { setIncorrectTargetId(null); setStatusMessage(""); };

  const setPanelIndex = (value) => {
    const next = typeof value === "function" ? value(panelIndex) : value;
    if (controlledPanelIndex === null) setLocalPanelIndex(next);
    onPanelIndexChange?.(next);
    setSelectedWordId(null); setDraggingWordId(null); clearFeedback();
  };
  const commit = (next) => {
    if (readOnly) return;
    if (controlled === null) setLocal(next);
    onResponsesChange?.(next);
  };
  const place = (targetId, wordId = selectedWordId) => {
    if (!wordId || readOnly) return;
    if (evaluatePlacement && !evaluatePlacement(targetId, wordId)) {
      setIncorrectTargetId(targetId);
      setStatusMessage("Incorrect placement. Try again.");
      setSelectedWordId(null);
      return;
    }
    commit(placeNativeDragDropWord(responses, targetId, wordId));
    setSelectedWordId(null); clearFeedback();
  };
  const beginDrag = (event, wordId) => {
    if (readOnly || event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingWordId(wordId); clearFeedback();
  };
  const finishDrag = (event, wordId) => {
    if (draggingWordId !== wordId) return;
    const targetId = closestDropTarget(event.clientX, event.clientY);
    if (targetId) { suppressClickWordId.current = wordId; place(targetId, wordId); }
    setDraggingWordId(null);
  };

  useEffect(() => {
    if (lastResetToken.current === resetToken) return;
    lastResetToken.current = resetToken;
    if (controlled === null) setLocal({});
    onResponsesChange?.({});
    setSelectedWordId(null); setDraggingWordId(null); clearFeedback();
  }, [controlled, onResponsesChange, resetToken]);

  if (!panel) return <p role="status">This Drag &amp; Drop activity has no panels yet.</p>;
  return <section className={`native-drag-drop ${presentationMode ? "native-drag-drop-teacher" : "native-drag-drop-student"}`} aria-label={document.metadata.title} data-read-only={readOnly || undefined}>
    <div className="native-drag-drop-visual-region">
      <PanelArtwork document={document} panel={panel} assetUrl={assetUrl}>
        {panel.dropTargets.map((target) => {
          const overrideWord = targetWordOverrides?.get(target.id) || null;
          const placedWord = wordById.get(responses[target.id]) || null;
          const visibleWord = overrideWord || placedWord;
          return <button key={target.id} type="button" className={`native-drag-drop-target${presentationMode ? " native-drag-drop-teacher-target" : ""}`} style={{ ...logicalAreaStyle(target.area, panel.surface), zIndex: panel.images.length + 2 }} data-drag-drop-target-id={target.id} data-occupied={Boolean(placedWord) || undefined} data-revealed={Boolean(overrideWord) || undefined} data-incorrect={incorrectTargetId === target.id || undefined} disabled={readOnly} aria-label={`${target.accessibleLabel}${visibleWord ? `, contains ${visibleWord.text}` : ", empty"}${incorrectTargetId === target.id ? ", incorrect placement" : ""}`} onClick={() => { if (selectedWordId) place(target.id); else if (placedWord) { commit(removeNativeDragDropResponse(responses, target.id)); clearFeedback(); } else if (onEmptyTargetActivate) { onEmptyTargetActivate(target.id); clearFeedback(); } }} onKeyDown={(event) => {
            if ((event.key === "Delete" || event.key === "Backspace") && placedWord && !readOnly) { event.preventDefault(); commit(removeNativeDragDropResponse(responses, target.id)); clearFeedback(); }
          }}>{visibleWord?.text || <span aria-hidden="true">Drop here</span>}</button>;
        })}
        <div className="native-drag-drop-bank" aria-label="Word bank">
          <p className="native-drag-drop-bank-instruction">Choose a word, then choose a target—or drag it into place.</p>
          <div className="native-drag-drop-bank-items">
            {interaction.words.map((word) => <button key={word.id} type="button" className="native-drag-drop-word" aria-pressed={selectedWordId === word.id} data-drag-drop-word-id={word.id} data-used={usedWordIds.has(word.id) || undefined} disabled={readOnly} onClick={() => { if (suppressClickWordId.current === word.id) { suppressClickWordId.current = null; return; } clearFeedback(); setSelectedWordId((current) => current === word.id ? null : word.id); }} onPointerDown={(event) => beginDrag(event, word.id)} onPointerUp={(event) => finishDrag(event, word.id)} onPointerCancel={() => setDraggingWordId(null)}>{word.text}</button>)}
          </div>
          <span className="native-drag-drop-status" role="status" aria-live="polite" data-incorrect={Boolean(statusMessage) || undefined}>{statusMessage || (selectedWordId ? `${wordById.get(selectedWordId)?.text || "Word"} selected. Choose a target.` : "")}</span>
        </div>
      </PanelArtwork>
      {!presentation ? <PanelNavigation panels={interaction.panels} panelIndex={panelIndex} setPanelIndex={setPanelIndex} /> : null}
    </div>
  </section>;
}

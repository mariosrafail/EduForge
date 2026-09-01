import { useEffect, useMemo, useRef, useState } from "react";

import { logicalAreaStyle } from "../builder-studio/stageGeometry.js";
import { nativeActivitySelectedFontState, useNativeActivityFonts } from "../native-activity-assets/useNativeActivityFonts.js";
import {
  NATIVE_DRAG_DROP_DEFAULT_PRESENTATION,
  nativeDragDropTextFontFamily,
  normalizeNativeDragDropResponses,
  placeNativeDragDropWord,
  removeNativeDragDropResponse,
  shuffleNativeDragDropWordIds,
  visibleNativeDragDropWordIds,
} from "../../data/native-activities/nativeDragDrop.js";
import "./nativeDragDrop.css";

const DRAG_MOVEMENT_THRESHOLD = 5;
const DRAG_RETURN_MS = 160;

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
  resolveWordForTarget = null,
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
  const [incorrectTargetId, setIncorrectTargetId] = useState(null);
  const [dragOverTargetId, setDragOverTargetId] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [sessionWordIds, setSessionWordIds] = useState(() => shuffleNativeDragDropWordIds(interaction.words));
  const [dragPreview, setDragPreview] = useState(null);
  const dragRef = useRef(null);
  const returnTimer = useRef(null);
  const suppressClickWordId = useRef(null);
  const lastResetToken = useRef(resetToken);
  const orderActivityId = useRef(document.activityId);
  const responses = useMemo(() => normalizeNativeDragDropResponses(controlled && typeof controlled === "object" ? controlled : local, document), [controlled, document, local]);
  const fontState = useNativeActivityFonts(document, assetUrl);
  const panelIndex = controlledPanelIndex ?? localPanelIndex;
  const panel = interaction.panels[panelIndex] || interaction.panels[0];
  const textPresentation = interaction.presentation || NATIVE_DRAG_DROP_DEFAULT_PRESENTATION;
  const bankWordStyle = textPresentation.bankWordStyle;
  const placedAnswerStyle = textPresentation.placedAnswerStyle;
  const bankFont = nativeDragDropTextFontFamily(document, bankWordStyle);
  const placedFont = nativeDragDropTextFontFamily(document, placedAnswerStyle);
  const bankFontState = nativeActivitySelectedFontState(fontState, document, bankWordStyle.fontAssetSlot);
  const placedFontState = nativeActivitySelectedFontState(fontState, document, placedAnswerStyle.fontAssetSlot);
  const wordById = new Map(interaction.words.map((word) => [word.id, word]));
  const visibleWordIds = visibleNativeDragDropWordIds(sessionWordIds, responses, targetWordOverrides);
  const visibleWords = visibleWordIds.map((wordId) => wordById.get(wordId)).filter(Boolean);
  const clearFeedback = () => { setIncorrectTargetId(null); setStatusMessage(""); };
  const clearReturnTimer = () => { if (returnTimer.current) globalThis.clearTimeout(returnTimer.current); returnTimer.current = null; };
  const clearDrag = () => { clearReturnTimer(); dragRef.current = null; setDragPreview(null); setDragOverTargetId(null); };

  const setPanelIndex = (value) => {
    const next = typeof value === "function" ? value(panelIndex) : value;
    if (controlledPanelIndex === null) setLocalPanelIndex(next);
    onPanelIndexChange?.(next);
    setSelectedWordId(null); clearDrag(); clearFeedback();
  };
  const commit = (next) => {
    if (readOnly) return;
    if (controlled === null) setLocal(next);
    onResponsesChange?.(next);
  };
  const place = (targetId, wordId = selectedWordId) => {
    if (!wordId || readOnly || !wordById.has(wordId)) return false;
    if (evaluatePlacement && !evaluatePlacement(targetId, wordId)) {
      setIncorrectTargetId(targetId);
      setStatusMessage("Incorrect placement. Try again.");
      setSelectedWordId(null);
      return false;
    }
    commit(placeNativeDragDropWord(responses, targetId, wordId));
    setSelectedWordId(null); clearFeedback();
    return true;
  };
  const returnDragPreview = (active) => {
    const next = { ...active, clientX: active.sourceRect.left + active.sourceRect.width / 2, clientY: active.sourceRect.top + active.sourceRect.height / 2, returning: true };
    setDragPreview(next);
    clearReturnTimer();
    returnTimer.current = globalThis.setTimeout(() => { returnTimer.current = null; setDragPreview(null); }, DRAG_RETURN_MS);
  };
  const beginDrag = (event, wordId) => {
    if (readOnly || event.button !== 0 || !visibleWordIds.includes(wordId)) return;
    const sourceRect = event.currentTarget.getBoundingClientRect();
    const sourceStyle = globalThis.getComputedStyle?.(event.currentTarget);
    const active = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      wordId,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      sourceRect: { left: sourceRect.left, top: sourceRect.top, width: sourceRect.width, height: sourceRect.height },
      previewStyle: { fontFamily: sourceStyle?.fontFamily, fontSize: sourceStyle?.fontSize, lineHeight: sourceStyle?.lineHeight, color: sourceStyle?.color },
      moved: false,
      returning: false,
    };
    clearReturnTimer();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = active;
    clearFeedback();
  };
  const moveDrag = (event) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const moved = active.moved || Math.hypot(event.clientX - active.startX, event.clientY - active.startY) >= DRAG_MOVEMENT_THRESHOLD;
    const next = { ...active, clientX: event.clientX, clientY: event.clientY, moved };
    dragRef.current = next;
    if (!moved) return;
    event.preventDefault();
    setDragPreview(next);
    const targetId = closestDropTarget(event.clientX, event.clientY);
    setDragOverTargetId(panel?.dropTargets.some((target) => target.id === targetId) ? targetId : null);
  };
  const finishDrag = (event, cancelled = false) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragOverTargetId(null);
    if (cancelled || !active.moved) { setDragPreview(null); return; }
    suppressClickWordId.current = active.wordId;
    const targetId = closestDropTarget(event.clientX, event.clientY);
    const validTarget = panel?.dropTargets.some((target) => target.id === targetId) ? targetId : null;
    if (validTarget && place(validTarget, active.wordId)) setDragPreview(null);
    else returnDragPreview({ ...active, clientX: event.clientX, clientY: event.clientY });
  };

  useEffect(() => {
    const currentIds = interaction.words.map((word) => word.id);
    setSessionWordIds((current) => {
      if (orderActivityId.current !== document.activityId) {
        orderActivityId.current = document.activityId;
        return shuffleNativeDragDropWordIds(interaction.words);
      }
      const available = new Set(currentIds);
      const retained = current.filter((wordId) => available.has(wordId));
      const retainedSet = new Set(retained);
      return [...retained, ...currentIds.filter((wordId) => !retainedSet.has(wordId))];
    });
  }, [document.activityId, interaction.words.map((word) => word.id).join("\0")]);
  useEffect(() => {
    if (selectedWordId && !visibleWordIds.includes(selectedWordId)) setSelectedWordId(null);
  }, [selectedWordId, visibleWordIds.join("\0")]);
  useEffect(() => () => { clearReturnTimer(); dragRef.current = null; }, []);
  useEffect(() => { if (readOnly) { setSelectedWordId(null); clearDrag(); } }, [readOnly]);
  useEffect(() => {
    if (lastResetToken.current === resetToken) return;
    lastResetToken.current = resetToken;
    if (controlled === null) setLocal({});
    onResponsesChange?.({});
    setSelectedWordId(null); clearDrag(); clearFeedback();
  }, [controlled, onResponsesChange, resetToken]);

  if (!panel) return <p role="status">This Drag &amp; Drop activity has no panels yet.</p>;
  const previewWord = dragPreview ? wordById.get(dragPreview.wordId) : null;
  return <section className={`native-drag-drop ${presentationMode ? "native-drag-drop-teacher" : "native-drag-drop-student"}`} aria-label={document.metadata.title} data-read-only={readOnly || undefined}>
    <div className="native-drag-drop-visual-region">
      <div className="native-drag-drop-workspace">
        <PanelArtwork document={document} panel={panel} assetUrl={assetUrl}>
          {panel.dropTargets.map((target) => {
            const overrideWord = targetWordOverrides?.get(target.id) || null;
            const placedWord = wordById.get(responses[target.id]) || null;
            const visibleWord = overrideWord || placedWord;
            return <button key={target.id} type="button" className={`native-drag-drop-target${presentationMode ? " native-drag-drop-teacher-target" : ""}`} style={{ ...logicalAreaStyle(target.area, panel.surface), zIndex: panel.images.length + 2 }} data-drag-drop-target-id={target.id} data-occupied={Boolean(placedWord) || undefined} data-revealed={Boolean(overrideWord) || undefined} data-incorrect={incorrectTargetId === target.id || undefined} data-drag-over={dragOverTargetId === target.id || undefined} disabled={readOnly} aria-label={`${target.accessibleLabel}${visibleWord ? `, contains ${visibleWord.text}` : ", empty"}${incorrectTargetId === target.id ? ", incorrect placement" : ""}`} onClick={() => {
              if (selectedWordId) place(target.id);
              else if (placedWord) { commit(removeNativeDragDropResponse(responses, target.id)); clearFeedback(); }
              else {
                const correctWordId = resolveWordForTarget?.(target.id);
                if (correctWordId) place(target.id, correctWordId);
                else if (onEmptyTargetActivate) { onEmptyTargetActivate(target.id); clearFeedback(); }
              }
            }} onKeyDown={(event) => {
              if ((event.key === "Delete" || event.key === "Backspace") && placedWord && !readOnly) { event.preventDefault(); commit(removeNativeDragDropResponse(responses, target.id)); clearFeedback(); }
            }}><span className="native-drag-drop-target-text" data-drag-drop-target-text data-font-status={placedFontState.status} style={{ fontFamily: placedFont, fontSize: `${(placedAnswerStyle.fontSize / panel.surface.width) * 100}cqw`, color: placedAnswerStyle.color }}>{visibleWord?.text || null}</span></button>;
          })}
        <div className="native-drag-drop-bank" aria-label="Word bank" data-font-status={bankFontState.status} style={{ zIndex: panel.images.length + 4 }}>
          <div className="native-drag-drop-bank-items">
            {visibleWords.map((word) => <button key={word.id} type="button" className="native-drag-drop-word" style={{ fontFamily: bankFont, fontSize: `${(bankWordStyle.fontSize / panel.surface.width) * 100}cqw`, color: bankWordStyle.color }} aria-pressed={selectedWordId === word.id} data-drag-drop-word-id={word.id} data-dragging={dragPreview?.wordId === word.id && !dragPreview.returning || undefined} disabled={readOnly} onClick={() => { if (suppressClickWordId.current === word.id) { suppressClickWordId.current = null; return; } clearFeedback(); setSelectedWordId((current) => current === word.id ? null : word.id); }} onPointerDown={(event) => beginDrag(event, word.id)} onPointerMove={moveDrag} onPointerUp={(event) => finishDrag(event)} onPointerCancel={(event) => finishDrag(event, true)} onLostPointerCapture={(event) => finishDrag(event, true)}>{word.text}</button>)}
          </div>
          <span className="native-drag-drop-status" role="status" aria-live="polite" data-incorrect={Boolean(statusMessage) || undefined}>{statusMessage || (selectedWordId ? `${wordById.get(selectedWordId)?.text || "Word"} selected. Choose a target.` : "")}</span>
        </div>
        </PanelArtwork>
      </div>
      {!presentation ? <PanelNavigation panels={interaction.panels} panelIndex={panelIndex} setPanelIndex={setPanelIndex} /> : null}
      {previewWord && dragPreview ? <span className="native-drag-drop-drag-preview" data-drag-drop-drag-preview data-returning={dragPreview.returning || undefined} style={{ left: dragPreview.clientX, top: dragPreview.clientY, width: dragPreview.sourceRect.width, minHeight: dragPreview.sourceRect.height, ...dragPreview.previewStyle }}>{previewWord.text}</span> : null}
    </div>
  </section>;
}

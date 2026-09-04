import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

function PanelArtwork({ document, panel, assetUrl, textMode, children }) {
  const assets = new Map(document.assets.map((asset) => [asset.slot, asset]));
  return <div className="native-drag-drop-stage-slot" style={textMode ? { aspectRatio: `${panel.surface.width} / ${panel.surface.height}` } : undefined}><div className="native-drag-drop-stage" data-surface-width={panel.surface.width} data-surface-height={panel.surface.height}>
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

function previewComputedStyle(element) {
  const style = globalThis.getComputedStyle?.(element);
  if (!style) return {};
  return {
    boxSizing: style.boxSizing, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
    lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, whiteSpace: style.whiteSpace, overflowWrap: style.overflowWrap,
    paddingTop: style.paddingTop, paddingRight: style.paddingRight, paddingBottom: style.paddingBottom, paddingLeft: style.paddingLeft,
    borderTop: style.borderTop, borderRight: style.borderRight, borderBottom: style.borderBottom, borderLeft: style.borderLeft,
    borderRadius: style.borderRadius, backgroundColor: style.backgroundColor, color: style.color, textAlign: style.textAlign,
  };
}

const responseIds = (value) => Array.isArray(value) ? value : value ? [value] : [];

export function NativeDragDropStudentSurface({
  document, assetUrl = () => "", responses: controlled = null, initialResponses = null, onResponsesChange = null,
  readOnly = false, evaluatePlacement = null, resolveWordForTarget = null, resolveWordsForTarget = null,
  targetWordOverrides = null, onEmptyTargetActivate = null, panelIndex: controlledPanelIndex = null,
  onPanelIndexChange = null, presentation = null, resetToken = null, presentationMode = false,
}) {
  const interaction = document.parts[0].interaction;
  const textMode = interaction.layoutMode === "text";
  const configuredBank = Number.isFinite(interaction.answerBankHeightPx);
  const [local, setLocal] = useState(() => normalizeNativeDragDropResponses(initialResponses, document));
  const [localPanelIndex, setLocalPanelIndex] = useState(0);
  const [selectedWordId, setSelectedWordId] = useState(null);
  const [incorrectTargetId, setIncorrectTargetId] = useState(null);
  const [dragOverTargetId, setDragOverTargetId] = useState(null);
  const [announcement, setAnnouncement] = useState("");
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
  const visibilityWords = textMode ? interaction.words.map((word) => ({ ...word, reusable: false })) : interaction.words;
  const visibleWordIds = visibleNativeDragDropWordIds(sessionWordIds, responses, targetWordOverrides, visibilityWords);
  const visibleWords = visibleWordIds.map((wordId) => wordById.get(wordId)).filter(Boolean);
  const clearFeedback = () => setIncorrectTargetId(null);
  const clearReturnTimer = () => { if (returnTimer.current) globalThis.clearTimeout(returnTimer.current); returnTimer.current = null; };
  const clearDrag = () => { clearReturnTimer(); dragRef.current = null; setDragPreview(null); setDragOverTargetId(null); };

  const setPanelIndex = (value) => {
    const next = typeof value === "function" ? value(panelIndex) : value;
    if (controlledPanelIndex === null) setLocalPanelIndex(next);
    onPanelIndexChange?.(next); setSelectedWordId(null); clearDrag(); clearFeedback();
  };
  const commit = (next) => { if (!readOnly) { if (controlled === null) setLocal(next); onResponsesChange?.(next); } };
  const place = (targetId, wordId = selectedWordId) => {
    const word = wordById.get(wordId);
    const target = panel?.dropTargets.find((entry) => entry.id === targetId);
    if (!word || !target || readOnly) return false;
    const current = responseIds(responses[targetId]);
    if (current.includes(wordId)) { setAnnouncement(`${textMode ? word.shortLabel : word.text} is already in ${target.accessibleLabel}.`); return false; }
    if (current.length >= target.capacity) { setAnnouncement(`${target.accessibleLabel} is full.`); return false; }
    const nextIds = [...current, wordId];
    if (evaluatePlacement && !evaluatePlacement(targetId, wordId, nextIds)) {
      setIncorrectTargetId(targetId); setAnnouncement(`${textMode ? word.shortLabel : word.text} does not belong in ${target.accessibleLabel}.`);
      if (!word.reusable || textMode) setSelectedWordId(null);
      return false;
    }
    commit(placeNativeDragDropWord(responses, targetId, wordId, { capacity: target.capacity, reusable: word.reusable && !textMode }));
    if (!word.reusable || textMode) setSelectedWordId(null);
    clearFeedback(); setAnnouncement(`${textMode ? word.shortLabel : word.text} placed in ${target.accessibleLabel}.`);
    return true;
  };
  const remove = (target, word) => {
    commit(removeNativeDragDropResponse(responses, target.id, word.id)); clearFeedback();
    setAnnouncement(`${textMode ? word.shortLabel : word.text} removed from ${target.accessibleLabel}.`);
  };
  const returnDragPreview = (active) => {
    const next = { ...active, clientX: active.sourceRect.left + active.offsetX, clientY: active.sourceRect.top + active.offsetY, returning: true };
    setDragPreview(next); clearReturnTimer();
    returnTimer.current = globalThis.setTimeout(() => { returnTimer.current = null; setDragPreview(null); }, DRAG_RETURN_MS);
  };
  const beginDrag = (event, wordId) => {
    if (readOnly || event.button !== 0 || !visibleWordIds.includes(wordId)) return;
    const source = textMode ? event.currentTarget.querySelector("[data-drag-drop-drag-handle]") || event.currentTarget : event.currentTarget;
    const sourceRect = source.getBoundingClientRect();
    const active = {
      pointerId: event.pointerId, pointerType: event.pointerType, wordId,
      startX: event.clientX, startY: event.clientY, clientX: event.clientX, clientY: event.clientY,
      offsetX: Math.min(sourceRect.width, Math.max(0, event.clientX - sourceRect.left)),
      offsetY: Math.min(sourceRect.height, Math.max(0, event.clientY - sourceRect.top)),
      sourceRect: { left: sourceRect.left, top: sourceRect.top, width: sourceRect.width, height: sourceRect.height },
      previewStyle: previewComputedStyle(source), moved: false, returning: false,
    };
    clearReturnTimer(); event.currentTarget.setPointerCapture?.(event.pointerId); dragRef.current = active; clearFeedback();
  };
  const moveDrag = (event) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const moved = active.moved || Math.hypot(event.clientX - active.startX, event.clientY - active.startY) >= DRAG_MOVEMENT_THRESHOLD;
    const next = { ...active, clientX: event.clientX, clientY: event.clientY, moved };
    dragRef.current = next;
    if (!moved) return;
    event.preventDefault(); setDragPreview(next);
    const targetId = closestDropTarget(event.clientX, event.clientY);
    setDragOverTargetId(panel?.dropTargets.some((target) => target.id === targetId) ? targetId : null);
  };
  const finishDrag = (event, cancelled = false) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    dragRef.current = null; setDragOverTargetId(null);
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
      if (orderActivityId.current !== document.activityId) { orderActivityId.current = document.activityId; return shuffleNativeDragDropWordIds(interaction.words); }
      const available = new Set(currentIds); const retained = current.filter((wordId) => available.has(wordId)); const retainedSet = new Set(retained);
      return [...retained, ...currentIds.filter((wordId) => !retainedSet.has(wordId))];
    });
  }, [document.activityId, interaction.words.map((word) => word.id).join("\0")]);
  useEffect(() => { if (selectedWordId && !visibleWordIds.includes(selectedWordId)) setSelectedWordId(null); }, [selectedWordId, visibleWordIds.join("\0")]);
  useEffect(() => () => { clearReturnTimer(); dragRef.current = null; }, []);
  useEffect(() => { if (readOnly) { setSelectedWordId(null); clearDrag(); } }, [readOnly]);
  useEffect(() => {
    if (lastResetToken.current === resetToken) return;
    lastResetToken.current = resetToken;
    if (controlled === null) setLocal({});
    onResponsesChange?.({}); setSelectedWordId(null); clearDrag(); clearFeedback(); setAnnouncement("Activity reset. All items returned to the bank.");
  }, [controlled, onResponsesChange, resetToken]);

  if (!panel) return <p role="status">This Drag &amp; Drop activity has no panels yet.</p>;
  const previewWord = dragPreview ? wordById.get(dragPreview.wordId) : null;
  const bank = <div className="native-drag-drop-bank" aria-label={textMode ? "Phrase bank" : "Word bank"} data-font-status={bankFontState.status} style={{ zIndex: panel.images.length + 4 }}>
    <div className="native-drag-drop-bank-items">
      {visibleWords.map((word) => <button key={word.id} type="button" className={`native-drag-drop-word${textMode ? " native-drag-drop-phrase" : ""}`} style={{ fontFamily: bankFont, fontSize: `${(bankWordStyle.fontSize / panel.surface.width) * 100}cqw`, color: bankWordStyle.color }} aria-label={textMode ? `${word.shortLabel}, ${word.text}` : word.text} aria-pressed={selectedWordId === word.id} data-drag-drop-word-id={word.id} data-dragging={dragPreview?.wordId === word.id && !dragPreview.returning || undefined} disabled={readOnly} onClick={() => { if (suppressClickWordId.current === word.id) { suppressClickWordId.current = null; return; } clearFeedback(); setSelectedWordId((current) => current === word.id ? null : word.id); }} onPointerDown={(event) => beginDrag(event, word.id)} onPointerMove={moveDrag} onPointerUp={(event) => finishDrag(event)} onPointerCancel={(event) => finishDrag(event, true)} onLostPointerCapture={(event) => finishDrag(event, true)}>{textMode ? <><span className="native-drag-drop-short-label" data-drag-drop-drag-handle>{word.shortLabel}</span><span>{word.shortLabel}. {word.text}</span></> : word.text}</button>)}
    </div>
    <span className="native-drag-drop-status" role="status" aria-live="polite">{announcement || (selectedWordId ? `${textMode ? `${wordById.get(selectedWordId)?.shortLabel}, ${wordById.get(selectedWordId)?.text}` : wordById.get(selectedWordId)?.text || "Item"} selected. Choose a target.` : "")}</span>
  </div>;
  const targets = panel.dropTargets.map((target) => {
    const placedWords = responseIds(responses[target.id]).map((id) => wordById.get(id)).filter(Boolean);
    const overrideValue = targetWordOverrides?.get(target.id);
    const overrideWords = (Array.isArray(overrideValue) ? overrideValue : overrideValue ? [overrideValue] : []).filter(Boolean);
    const visibleWordsAtTarget = overrideWords.length ? overrideWords : placedWords;
    const full = placedWords.length >= target.capacity;
    const contents = visibleWordsAtTarget.length ? visibleWordsAtTarget.map((word) => textMode ? word.shortLabel : word.text).join(", ") : "empty";
    const activate = () => {
      if (selectedWordId) place(target.id);
      else if (placedWords.length === 1 && target.capacity === 1) remove(target, placedWords[0]);
      else if (placedWords.length < target.capacity) {
        const legacyId = resolveWordForTarget?.(target.id);
        const correctIds = resolveWordsForTarget?.(target.id) || (legacyId ? [legacyId] : []);
        const nextWordId = correctIds.find((id) => !placedWords.some((word) => word.id === id));
        if (nextWordId) place(target.id, nextWordId);
        else if (!placedWords.length && onEmptyTargetActivate) { onEmptyTargetActivate(target.id); clearFeedback(); }
      }
    };
    return <div key={target.id} role="button" tabIndex={readOnly ? -1 : 0} className={`native-drag-drop-target${presentationMode ? " native-drag-drop-teacher-target" : ""}`} style={{ ...logicalAreaStyle(target.area, panel.surface), zIndex: panel.images.length + 2 }} data-drag-drop-target-id={target.id} data-occupied={Boolean(placedWords.length) || undefined} data-full={full || undefined} data-revealed={Boolean(overrideWords.length) || undefined} data-incorrect={incorrectTargetId === target.id || undefined} data-drag-over={dragOverTargetId === target.id || undefined} aria-disabled={readOnly || undefined} aria-label={`${target.accessibleLabel}, contains ${contents}, ${placedWords.length} of ${target.capacity} places used`} onClick={activate} onKeyDown={(event) => {
      if ((event.key === "Enter" || event.key === " ") && !readOnly) { event.preventDefault(); activate(); }
      if ((event.key === "Delete" || event.key === "Backspace") && placedWords.length && !readOnly) { event.preventDefault(); remove(target, placedWords[placedWords.length - 1]); }
    }}><span className="native-drag-drop-target-items" data-font-status={placedFontState.status} style={{ fontFamily: placedFont, fontSize: `${(placedAnswerStyle.fontSize / panel.surface.width) * 100}cqw`, color: placedAnswerStyle.color }}>{visibleWordsAtTarget.map((word) => overrideWords.length || readOnly ? <span key={word.id} className="native-drag-drop-target-text" data-drag-drop-target-text aria-label={textMode ? `${word.shortLabel}, ${word.text}` : word.text}>{textMode ? word.shortLabel : word.text}</span> : <button key={word.id} type="button" className="native-drag-drop-target-text" data-drag-drop-target-text aria-label={`Remove ${textMode ? `${word.shortLabel}, ${word.text}` : word.text} from ${target.accessibleLabel}`} onClick={(event) => { event.stopPropagation(); remove(target, word); }} onKeyDown={(event) => { if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); event.stopPropagation(); remove(target, word); } }}>{textMode ? word.shortLabel : word.text}</button>)}</span></div>;
  });
  const rootStyle = {
    ...(interaction.answerBankHeightPx ? { "--native-drag-drop-bank-height": `${interaction.answerBankHeightPx}px` } : {}),
    ...(interaction.textPanelHeightPx ? { "--native-drag-drop-text-panel-height": `${interaction.textPanelHeightPx}px` } : {}),
  };
  const preview = previewWord && dragPreview ? <span className="native-drag-drop-drag-preview" data-drag-drop-drag-preview data-returning={dragPreview.returning || undefined} aria-label={textMode ? `${previewWord.shortLabel}, ${previewWord.text}` : previewWord.text} style={{ left: dragPreview.clientX - dragPreview.offsetX, top: dragPreview.clientY - dragPreview.offsetY, width: dragPreview.sourceRect.width, height: dragPreview.sourceRect.height, minWidth: dragPreview.sourceRect.width, maxWidth: "none", minHeight: dragPreview.sourceRect.height, maxHeight: "none", ...dragPreview.previewStyle }}>{textMode ? previewWord.shortLabel : previewWord.text}</span> : null;
  return <section className={`native-drag-drop ${presentationMode ? "native-drag-drop-teacher" : "native-drag-drop-student"}`} aria-label={document.metadata.title} data-layout-mode={textMode ? "text" : "standard"} data-configured-bank-height={interaction.answerBankHeightPx ? "true" : undefined} data-read-only={readOnly || undefined} style={rootStyle}>
    <div className="native-drag-drop-visual-region">
      <div className="native-drag-drop-workspace"><PanelArtwork document={document} panel={panel} assetUrl={assetUrl} textMode={textMode}>{targets}{!textMode && !configuredBank ? bank : null}</PanelArtwork></div>
      {textMode || configuredBank ? bank : null}
      {!presentation ? <PanelNavigation panels={interaction.panels} panelIndex={panelIndex} setPanelIndex={setPanelIndex} /> : null}
    </div>
    {preview && globalThis.document?.body ? createPortal(preview, globalThis.document.body) : preview}
  </section>;
}

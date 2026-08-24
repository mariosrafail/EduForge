import { useEffect, useMemo, useRef, useState } from "react";

import { logicalAreaStyle } from "../builder-studio/stageGeometry.js";
import {
  normalizeNativeDragDropResponses,
  placeNativeDragDropWord,
  removeNativeDragDropResponse,
  updateNativeDragDropRevealState,
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

export function NativeDragDropStudentSurface({ document, assetUrl = () => "", responses: controlled = null, initialResponses = null, onResponsesChange = null, readOnly = false }) {
  const interaction = document.parts[0].interaction;
  const [local, setLocal] = useState(() => normalizeNativeDragDropResponses(initialResponses, document));
  const [panelIndex, setPanelIndex] = useState(0);
  const [selectedWordId, setSelectedWordId] = useState(null);
  const [draggingWordId, setDraggingWordId] = useState(null);
  const suppressClickWordId = useRef(null);
  const responses = useMemo(() => normalizeNativeDragDropResponses(controlled && typeof controlled === "object" ? controlled : local, document), [controlled, document, local]);
  const panel = interaction.panels[panelIndex] || interaction.panels[0];
  const wordById = new Map(interaction.words.map((word) => [word.id, word]));
  const usedWordIds = new Set(Object.values(responses));

  const commit = (next) => {
    if (readOnly) return;
    if (controlled === null) setLocal(next);
    onResponsesChange?.(next);
  };
  const place = (targetId, wordId = selectedWordId) => {
    if (!wordId || readOnly) return;
    commit(placeNativeDragDropWord(responses, targetId, wordId));
    setSelectedWordId(null);
  };
  const beginDrag = (event, wordId) => {
    if (readOnly || event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingWordId(wordId);
  };
  const finishDrag = (event, wordId) => {
    if (draggingWordId !== wordId) return;
    const targetId = closestDropTarget(event.clientX, event.clientY);
    if (targetId) { suppressClickWordId.current = wordId; place(targetId, wordId); }
    setDraggingWordId(null);
  };

  if (!panel) return <p role="status">This Drag &amp; Drop activity has no panels yet.</p>;
  return <section className="native-drag-drop native-drag-drop-student" aria-label={document.metadata.title} data-read-only={readOnly || undefined}>
    <div className="native-drag-drop-visual-region">
      <PanelArtwork document={document} panel={panel} assetUrl={assetUrl}>
        {panel.dropTargets.map((target) => {
          const placed = wordById.get(responses[target.id]);
          return <button key={target.id} type="button" className="native-drag-drop-target" style={{ ...logicalAreaStyle(target.area, panel.surface), zIndex: panel.images.length + 2 }} data-drag-drop-target-id={target.id} data-occupied={Boolean(placed) || undefined} disabled={readOnly} aria-label={`${target.accessibleLabel}${placed ? `, contains ${placed.text}` : ", empty"}`} onClick={() => selectedWordId ? place(target.id) : placed ? commit(removeNativeDragDropResponse(responses, target.id)) : null} onKeyDown={(event) => {
            if ((event.key === "Delete" || event.key === "Backspace") && placed && !readOnly) { event.preventDefault(); commit(removeNativeDragDropResponse(responses, target.id)); }
          }}>{placed?.text || <span aria-hidden="true">Drop here</span>}</button>;
        })}
      </PanelArtwork>
      <PanelNavigation panels={interaction.panels} panelIndex={panelIndex} setPanelIndex={setPanelIndex} />
    </div>
    <div className="native-drag-drop-bank" aria-label="Word bank">
      <p className="native-drag-drop-bank-instruction">Choose a word, then choose a target—or drag it into place.</p>
      <div className="native-drag-drop-bank-items">
        {interaction.words.map((word) => <button key={word.id} type="button" className="native-drag-drop-word" aria-pressed={selectedWordId === word.id} data-used={usedWordIds.has(word.id) || undefined} disabled={readOnly} onClick={() => { if (suppressClickWordId.current === word.id) { suppressClickWordId.current = null; return; } setSelectedWordId((current) => current === word.id ? null : word.id); }} onPointerDown={(event) => beginDrag(event, word.id)} onPointerUp={(event) => finishDrag(event, word.id)} onPointerCancel={() => setDraggingWordId(null)}>{word.text}</button>)}
      </div>
      <span className="native-drag-drop-status" role="status" aria-live="polite">{selectedWordId ? `${wordById.get(selectedWordId)?.text || "Word"} selected. Choose a target.` : ""}</span>
    </div>
  </section>;
}

export function NativeDragDropTeacherSurface({ publicDocument, teacherDocument, assetUrl = () => "", presentation = null }) {
  const interaction = publicDocument.parts[0].interaction;
  const targetIds = interaction.panels.flatMap((panel) => panel.dropTargets.map((target) => target.id));
  const wordById = new Map(interaction.words.map((word) => [word.id, word]));
  const wordIdByTarget = new Map(teacherDocument.parts[0].solution.mappings.map((mapping) => [mapping.targetId, mapping.wordId]));
  const [panelIndex, setPanelIndex] = useState(0);
  const [revealed, setRevealed] = useState(() => new Set());
  const lastCommand = useRef(presentation?.command?.token);
  const panel = interaction.panels[panelIndex] || interaction.panels[0];

  useEffect(() => {
    const command = presentation?.command;
    if (!command || command.token === lastCommand.current) return;
    lastCommand.current = command.token;
    if (command.type === "previous-panel") setPanelIndex((current) => Math.max(0, current - 1));
    else if (command.type === "next-panel") setPanelIndex((current) => Math.min(interaction.panels.length - 1, current + 1));
    else {
      if (command.type === "reset-activity") setPanelIndex(0);
      if (command.type === "show-next") {
        const nextTargetId = targetIds.find((targetId) => !revealed.has(targetId));
        const nextPanelIndex = interaction.panels.findIndex((entry) => entry.dropTargets.some((target) => target.id === nextTargetId));
        if (nextPanelIndex >= 0) setPanelIndex(nextPanelIndex);
      }
      setRevealed((current) => updateNativeDragDropRevealState(current, targetIds, command.type));
    }
  }, [interaction.panels, presentation?.command, revealed, targetIds.join("\0")]);
  useEffect(() => presentation?.onStateChange?.({ panelIndex, panelCount: interaction.panels.length, reveal: { supported: true, total: targetIds.length, revealed: revealed.size, pristine: revealed.size === 0 } }), [interaction.panels.length, panelIndex, presentation?.onStateChange, revealed, targetIds.length]);

  if (!panel) return <p role="status">This Drag &amp; Drop activity has no panels yet.</p>;
  return <section className="native-drag-drop native-drag-drop-teacher" aria-label={publicDocument.metadata.title}>
    <div className="native-drag-drop-visual-region">
      <PanelArtwork document={publicDocument} panel={panel} assetUrl={assetUrl}>
        {panel.dropTargets.map((target, index) => {
          const isRevealed = revealed.has(target.id);
          const correctWord = isRevealed ? wordById.get(wordIdByTarget.get(target.id)) : null;
          return <button key={target.id} type="button" className="native-drag-drop-target native-drag-drop-teacher-target" style={{ ...logicalAreaStyle(target.area, panel.surface), zIndex: panel.images.length + 2 }} data-revealed={isRevealed || undefined} aria-label={`${isRevealed ? "Revealed" : "Reveal"} answer for target ${index + 1}`} onClick={() => setRevealed((current) => updateNativeDragDropRevealState(current, targetIds, { targetId: target.id }))}>{correctWord?.text || <span aria-hidden="true">Reveal</span>}</button>;
        })}
      </PanelArtwork>
      {!presentation ? <PanelNavigation panels={interaction.panels} panelIndex={panelIndex} setPanelIndex={setPanelIndex} /> : null}
    </div>
    <div className="native-drag-drop-bank" aria-label="Word bank"><div className="native-drag-drop-bank-items">{interaction.words.map((word) => <span key={word.id} className="native-drag-drop-word is-reference">{word.text}</span>)}</div></div>
  </section>;
}

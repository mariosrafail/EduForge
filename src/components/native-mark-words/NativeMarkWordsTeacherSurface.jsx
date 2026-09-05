import { useEffect, useRef, useState } from "react";
import { NativeMarkWordsPresentation } from "./NativeMarkWordsStudentSurface.jsx";
import { normalizeNativeRuntimeTeacherDocument } from "../../data/native-activities/nativeActivityRuntimeValidation.js";

function TeacherSession({ publicDocument, teacherDocument, assetUrl, presentation }) {
  const [revealed, setRevealed] = useState([]); const [panelIndex, setPanelIndex] = useState(0);
  const lastCommand = useRef(presentation?.command?.token);
  const items = publicDocument.parts[0].interaction.items;
  const panels = publicDocument.parts[0].interaction.presentation.kind === "image-hotspot" ? publicDocument.parts[0].interaction.presentation.panels : [];
  const showNext = () => { const next = items.find((item) => !revealed.includes(item.id)); if (next) { setRevealed((current) => [...current, next.id]); const panel = panels.findIndex((entry) => entry.hotspots.some((hotspot) => hotspot.itemId === next.id)); if (panel >= 0) setPanelIndex(panel); } };
  const reset = () => { setRevealed([]); setPanelIndex(0); };
  useEffect(() => {
    const command = presentation?.command;
    if (!command || command.token === lastCommand.current) return;
    lastCommand.current = command.token;
    if (command.type === "show-next") showNext();
    if (command.type === "show-all") setRevealed(items.map((item) => item.id));
    if (command.type === "reset-activity") reset();
    if (command.type === "previous-panel") setPanelIndex((index) => Math.max(0, index - 1));
    if (command.type === "next-panel") setPanelIndex((index) => Math.min(Math.max(0, panels.length - 1), index + 1));
  }, [presentation?.command]);
  useEffect(() => { presentation?.onStateChange?.({ panelIndex, panelCount: panels.length, reveal: { supported: true, total: items.length, revealed: revealed.length, pristine: !revealed.length && !panelIndex } }); }, [presentation?.onStateChange, panelIndex, panels.length, items.length, revealed]);
  const responses = Object.fromEntries(teacherDocument.parts[0].solution.answers.filter((answer) => revealed.includes(answer.itemId)).map((answer) => [answer.itemId, answer.correctWordIds]));
  return <>
    {!presentation ? <div role="group" aria-label="Teacher presentation"><button type="button" onClick={showNext}>Reveal next</button><button type="button" onClick={() => setRevealed(items.map((item) => item.id))}>Reveal all</button><button type="button" onClick={reset}>Hide / reset</button></div> : null}
    <NativeMarkWordsPresentation document={publicDocument} assetUrl={assetUrl} responses={responses} panelIndex={panelIndex} onPanelChange={setPanelIndex} externalNavigation={Boolean(presentation)} onToggle={(itemId) => setRevealed((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId])} />
  </>;
}

export function NativeMarkWordsTeacherSurface({ publicDocument, teacherDocument, identity = "", ...props }) {
  try { normalizeNativeRuntimeTeacherDocument(teacherDocument, { activityId: publicDocument.activityId, kind: "mark-the-words", publicDocument }); }
  catch { return <p role="alert">Teacher answers are unavailable.</p>; }
  return <TeacherSession key={`${publicDocument.activityId}:${identity}`} {...{ publicDocument, teacherDocument }} {...props} />;
}

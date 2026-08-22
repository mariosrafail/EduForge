import { useEffect, useRef, useState } from "react";

import { autoFitNativeOpenResponseAnswer } from "../../data/native-activities/nativeOpenResponseAutoFit.js";
import { logicalAreaStyle, NativeOpenResponseSurface } from "./NativeOpenResponseSurface.jsx";
import { updateNativeOpenResponseReveals } from "./nativeOpenResponseTeacherRuntime.js";

function NativeOpenResponseTeacherSession({ publicDocument, teacherDocument, assetUrl, onOverflow, presentation, audioHotspotPresentation }) {
  const [revealed, setRevealed] = useState(() => new Set());
  const interaction = publicDocument.parts[0].interaction;
  const answers = new Map(teacherDocument.parts[0].solution.modelAnswers.map((answer) => [answer.questionId, answer.text]));
  const questionIds = interaction.questions.map((question) => question.id);
  const lastCommandToken = useRef(presentation?.command?.token);
  const onStateChange = presentation?.onStateChange;

  useEffect(() => {
    const command = presentation?.command;
    if (!command || command.token === lastCommandToken.current) return;
    lastCommandToken.current = command.token;
    setRevealed((current) => updateNativeOpenResponseReveals(current, questionIds, command.type));
  }, [presentation?.command, questionIds.join("\u0000")]);

  useEffect(() => {
    onStateChange?.({
      panelIndex: 0,
      panelCount: 0,
      reveal: { supported: true, total: questionIds.length, revealed: revealed.size, pristine: revealed.size === 0 },
    });
  }, [onStateChange, questionIds.length, revealed]);

  const toggle = (questionId) => setRevealed((current) => { const next = new Set(current); if (next.has(questionId)) next.delete(questionId); else next.add(questionId); return next; });
  return <NativeOpenResponseSurface document={publicDocument} assetUrl={assetUrl} audioHotspotPresentation={audioHotspotPresentation}>
    {interaction.questions.map((question) => {
      const visible = revealed.has(question.id);
      const fit = autoFitNativeOpenResponseAnswer({ text: answers.get(question.id) || "", responseRegion: question.responseRegion });
      if (!fit.fits) onOverflow(question.id, fit.overflowReason);
      return <button key={question.id} type="button" className="native-or-answer-layer" style={logicalAreaStyle(question.responseRegion.area, interaction.surface)} aria-label={`${visible ? "Hide" : "Reveal"} model answer for ${question.responseRegion.ariaLabel}`} aria-pressed={visible} onClick={() => toggle(question.id)} data-fit={fit.fits ? "true" : "false"}>
        {visible ? fit.lines.slice(0, fit.baselines.length).map((line, index) => <span key={index} className="native-or-answer-line" style={{ left: `${(question.responseRegion.presentation.paddingX / question.responseRegion.area.width) * 100}%`, top: `${(question.responseRegion.presentation.linePositions[index] / question.responseRegion.area.height) * 100}%`, width: `${(question.responseRegion.presentation.lineWidth / question.responseRegion.area.width) * 100}%`, fontFamily: question.responseRegion.presentation.answerFontFamily, fontSize: `${(fit.fontSize / interaction.surface.width) * 100}cqw`, color: question.responseRegion.presentation.color, textAlign: question.responseRegion.presentation.align }}>{line}</span>) : null}
      </button>;
    })}
  </NativeOpenResponseSurface>;
}

export function NativeOpenResponseTeacherSurface({ publicDocument, teacherDocument, assetUrl = () => "", onOverflow = () => {}, presentation = null, audioHotspotPresentation = null }) {
  return <NativeOpenResponseTeacherSession key={publicDocument.activityId} publicDocument={publicDocument} teacherDocument={teacherDocument} assetUrl={assetUrl} onOverflow={onOverflow} presentation={presentation} audioHotspotPresentation={audioHotspotPresentation} />;
}

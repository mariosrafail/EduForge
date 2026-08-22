import { useEffect, useRef, useState } from "react";

import { NativeSingleChoicePresentation } from "./NativeSingleChoicePresentation.jsx";
import { createNativeSingleChoiceTeacherSession, nativeSingleChoiceTeacherPresentationState, updateNativeSingleChoiceTeacherSession } from "./nativeSingleChoiceTeacherRuntime.js";

function NativeSingleChoiceTeacherSession({ publicDocument, teacherDocument, assetUrl, presentation, audioHotspotPresentation }) {
  const [session, setSession] = useState(createNativeSingleChoiceTeacherSession);
  const [announcement, setAnnouncement] = useState("");
  const lastCommandToken = useRef(presentation?.command?.token);
  const onStateChange = presentation?.onStateChange;

  useEffect(() => {
    const command = presentation?.command;
    if (!command || command.token === lastCommandToken.current) return;
    lastCommandToken.current = command.token;
    setSession((current) => updateNativeSingleChoiceTeacherSession(current, publicDocument, teacherDocument, command));
  }, [presentation?.command, publicDocument, teacherDocument]);

  useEffect(() => {
    onStateChange?.(nativeSingleChoiceTeacherPresentationState(session, publicDocument, teacherDocument));
  }, [onStateChange, publicDocument, session, teacherDocument]);

  const choose = ({ questionId, optionId }) => {
    if (session.solvedQuestionIds.has(questionId)) return;
    const correctOptionId = teacherDocument.parts[0].solution.correctAnswers.find((answer) => answer.questionId === questionId)?.correctOptionId;
    const correct = correctOptionId === optionId;
    setSession((current) => updateNativeSingleChoiceTeacherSession(current, publicDocument, teacherDocument, { type: "select", questionId, optionId }));
    const questionNumber = publicDocument.parts[0].interaction.questions.findIndex((question) => question.id === questionId) + 1;
    setAnnouncement(`Question ${questionNumber}: ${correct ? "correct" : "incorrect"}.`);
  };
  return <>
    <NativeSingleChoicePresentation
      document={publicDocument}
      assetUrl={assetUrl}
      responses={session.responses}
      onSelect={choose}
      optionStates={session.optionStates}
      disabledQuestionIds={session.solvedQuestionIds}
      navigationMode={presentation ? "external" : "inline"}
      panelIndex={session.panelIndex}
      className="native-single-choice-teacher"
      audioHotspotPresentation={audioHotspotPresentation}
    />
    <span className="native-single-choice-sr-only" role="status" aria-live="polite">{announcement}</span>
  </>;
}

export function NativeSingleChoiceTeacherSurface({ publicDocument, teacherDocument, assetUrl = () => "", presentation = null, audioHotspotPresentation = null }) {
  return <NativeSingleChoiceTeacherSession key={publicDocument.activityId} publicDocument={publicDocument} teacherDocument={teacherDocument} assetUrl={assetUrl} presentation={presentation} audioHotspotPresentation={audioHotspotPresentation} />;
}

import { useState } from "react";

import { NativeSingleChoicePresentation } from "./NativeSingleChoicePresentation.jsx";

function NativeSingleChoiceTeacherSession({ publicDocument, teacherDocument, assetUrl }) {
  const correctAnswers = new Map(teacherDocument.parts[0].solution.correctAnswers.map((answer) => [answer.questionId, answer.correctOptionId]));
  const [responses, setResponses] = useState({});
  const [optionStates, setOptionStates] = useState({});
  const [solvedQuestionIds, setSolvedQuestionIds] = useState(() => new Set());
  const [announcement, setAnnouncement] = useState("");
  const choose = ({ questionId, optionId, responses: nextResponses }) => {
    if (solvedQuestionIds.has(questionId)) return;
    const correct = correctAnswers.get(questionId) === optionId;
    setResponses(nextResponses);
    setOptionStates((current) => ({ ...current, [optionId]: correct ? "correct" : "incorrect" }));
    if (correct) setSolvedQuestionIds((current) => new Set(current).add(questionId));
    const questionNumber = publicDocument.parts[0].interaction.questions.findIndex((question) => question.id === questionId) + 1;
    setAnnouncement(`Question ${questionNumber}: ${correct ? "correct" : "incorrect"}.`);
  };
  return <>
    <NativeSingleChoicePresentation
      document={publicDocument}
      assetUrl={assetUrl}
      responses={responses}
      onSelect={choose}
      optionStates={optionStates}
      disabledQuestionIds={solvedQuestionIds}
      className="native-single-choice-teacher"
    />
    <span className="native-single-choice-sr-only" role="status" aria-live="polite">{announcement}</span>
  </>;
}

export function NativeSingleChoiceTeacherSurface({ publicDocument, teacherDocument, assetUrl = () => "" }) {
  return <NativeSingleChoiceTeacherSession key={publicDocument.activityId} publicDocument={publicDocument} teacherDocument={teacherDocument} assetUrl={assetUrl} />;
}

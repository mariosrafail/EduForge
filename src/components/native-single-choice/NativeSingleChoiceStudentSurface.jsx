import { useState } from "react";
import "./nativeSingleChoice.css";

export function NativeSingleChoiceStudentSurface({ document, responses: controlledResponses = null, initialResponses = null, onResponsesChange = null, readOnly = false }) {
  const [localResponses, setLocalResponses] = useState(() => ({ ...(initialResponses || {}) }));
  const responses = controlledResponses && typeof controlledResponses === "object" ? controlledResponses : localResponses;
  const update = (questionId, optionId) => {
    const next = { ...responses, [questionId]: optionId };
    if (controlledResponses === null) setLocalResponses(next);
    onResponsesChange?.(next);
  };
  return <div className="native-single-choice-student">
    {document.parts[0].interaction.questions.map((question, questionIndex) => <fieldset key={question.id} disabled={readOnly}>
      <legend>{questionIndex + 1}. {question.prompt}</legend>
      {question.options.map((option) => <label key={option.id}>
        <input type="radio" name={question.id} value={option.id} checked={responses[question.id] === option.id} onChange={() => update(question.id, option.id)} />
        <span>{option.text}</span>
      </label>)}
    </fieldset>)}
  </div>;
}

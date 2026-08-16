import { useState } from "react";

import { logicalAreaStyle, NativeOpenResponseSurface } from "./NativeOpenResponseSurface.jsx";

export function NativeOpenResponseStudentSurface({
  document,
  assetUrl = () => "",
  responses: controlledResponses = null,
  initialResponses = null,
  onResponsesChange = null,
  readOnly = false,
}) {
  const [localResponses, setLocalResponses] = useState(() => new Map(Object.entries(initialResponses || {})));
  const responses = controlledResponses instanceof Map
    ? controlledResponses
    : controlledResponses && typeof controlledResponses === "object"
      ? new Map(Object.entries(controlledResponses))
      : localResponses;
  const updateResponse = (questionId, value) => {
    const next = new Map(responses).set(questionId, value);
    if (controlledResponses === null) setLocalResponses(next);
    onResponsesChange?.(Object.fromEntries(next));
  };
  const interaction = document.parts[0].interaction;
  return <NativeOpenResponseSurface document={document} assetUrl={assetUrl}>
    {interaction.questions.map((question) => {
      const { responseRegion } = question;
      const { presentation } = responseRegion;
      return <textarea
        key={question.id}
        className="native-or-student-response"
        style={{
          ...logicalAreaStyle(responseRegion.area, interaction.surface),
          padding: `${(presentation.paddingY / interaction.surface.width) * 100}cqw ${(presentation.paddingX / interaction.surface.width) * 100}cqw`,
          fontFamily: presentation.answerFontFamily,
          fontSize: `${(presentation.answerFontSizeMax / interaction.surface.width) * 100}cqw`,
          lineHeight: `${(presentation.lineSpacing / interaction.surface.width) * 100}cqw`,
          color: presentation.color,
          textAlign: presentation.align,
        }}
        aria-label={responseRegion.ariaLabel}
        value={responses.get(question.id) || ""}
        readOnly={readOnly}
        onChange={(event) => updateResponse(question.id, event.target.value)}
      />;
    })}
  </NativeOpenResponseSurface>;
}

import { useState } from "react";

import { logicalAreaStyle, NativeOpenResponseSurface } from "./NativeOpenResponseSurface.jsx";

export function NativeOpenResponseStudentSurface({ document, assetUrl = () => "" }) {
  const [responses, setResponses] = useState(() => new Map());
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
        onChange={(event) => setResponses((current) => new Map(current).set(question.id, event.target.value))}
      />;
    })}
  </NativeOpenResponseSurface>;
}

import { useEffect, useState } from "react";
import { nativeOpenResponsePanelResponseIds, nativeOpenResponsePanels } from "../../data/native-activities/nativeOpenResponse.js";

import { logicalAreaStyle, NativeOpenResponseSurface, nativeOpenResponseResponseAriaLabel } from "./NativeOpenResponseSurface.jsx";

export function NativeOpenResponseStudentSurface({
  document,
  assetUrl = () => "",
  responses: controlledResponses = null,
  initialResponses = null,
  onResponsesChange = null,
  readOnly = false,
  audioHotspotPresentation = null,
}) {
  const [localResponses, setLocalResponses] = useState(() => new Map(Object.entries(initialResponses || {})));
  const [panelIndex, setPanelIndex] = useState(0);
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
  const panels = nativeOpenResponsePanels(interaction);
  const panel = panels[panelIndex] || panels[0];
  useEffect(() => { if (panel) audioHotspotPresentation?.onPanelChange?.(panel.legacy ? null : panel.id); }, [audioHotspotPresentation, panel]);
  if (!panel) return <p role="status">This Open Response activity has no panels yet.</p>;
  const responseIds = nativeOpenResponsePanelResponseIds(panel);
  const visibleQuestions = interaction.questions.filter((question) => responseIds.includes(question.id));
  return <section className="native-or-panel-session"><NativeOpenResponseSurface document={document} panel={panel} assetUrl={assetUrl} audioHotspotPresentation={audioHotspotPresentation}>
    {visibleQuestions.map((question) => {
      const { responseRegion } = question;
      const { presentation } = responseRegion;
      return <textarea
        key={question.id}
        className="native-or-student-response"
        style={{
          ...logicalAreaStyle(responseRegion.area, panel.surface),
          padding: `${(presentation.paddingY / panel.surface.width) * 100}cqw ${(presentation.paddingX / panel.surface.width) * 100}cqw`,
          fontFamily: presentation.answerFontFamily,
          fontSize: `${(presentation.answerFontSizeMax / panel.surface.width) * 100}cqw`,
          lineHeight: `${(presentation.lineSpacing / panel.surface.width) * 100}cqw`,
          color: presentation.color,
          textAlign: presentation.align,
        }}
        aria-label={nativeOpenResponseResponseAriaLabel(question)}
        value={responses.get(question.id) || ""}
        readOnly={readOnly}
        onChange={(event) => updateResponse(question.id, event.target.value)}
      />;
    })}
  </NativeOpenResponseSurface>{panels.length > 1 ? <nav className="native-or-panel-navigation" aria-label="Open Response panels"><button type="button" disabled={panelIndex === 0} onClick={() => setPanelIndex((current) => Math.max(0, current - 1))}>Previous</button><span>Panel {panelIndex + 1} of {panels.length}</span><button type="button" disabled={panelIndex === panels.length - 1} onClick={() => setPanelIndex((current) => Math.min(panels.length - 1, current + 1))}>Next</button></nav> : null}</section>;
}

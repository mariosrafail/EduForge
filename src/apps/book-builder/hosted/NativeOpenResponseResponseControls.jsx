import { useEffect, useState } from "react";

import { QuickNumber } from "../../../components/builder-studio/StageGeometryControls.jsx";
import { StudioField } from "../../../components/builder-studio/StudioControls.jsx";
import { nativeActivitySelectedFontState, useNativeActivityFonts } from "../../../components/native-activity-assets/useNativeActivityFonts.js";
import { fitNativeOpenResponseRuntimeAnswer } from "../../../components/native-open-response/nativeOpenResponseRuntimeFit.js";
import { commitNativeOpenResponseConfiguredFontSize, nativeOpenResponseAnswerFontFamily } from "../../../data/native-activities/nativeOpenResponse.js";
import { NativeActivityFontControls } from "./NativeCompleteSentencesFontControls.jsx";

function fitMessage(presentation, fit) {
  if (!fit) return `Requested ${presentation.answerFontSizeMax}px · rendered size is unavailable until a model answer exists.`;
  if (!fit.fits) return `Requested ${presentation.answerFontSizeMax}px · rendered ${fit.fontSize}px · overflow: ${fit.overflowReason}.`;
  const lines = `${fit.lines.length} line${fit.lines.length === 1 ? "" : "s"}`;
  return fit.fontSize < presentation.answerFontSizeMax ? `Auto-fit applied: requested ${presentation.answerFontSizeMax}px · rendered ${fit.fontSize}px across ${lines}.` : `Requested and rendered at ${fit.fontSize}px across ${lines}.`;
}

function TypographyFeedback({ document, assetUrl, question, text }) {
  const fontState = useNativeActivityFonts(document, assetUrl);
  const presentation = question.responseRegion.presentation;
  const fontFamily = nativeOpenResponseAnswerFontFamily(document, presentation);
  const selectedFont = nativeActivitySelectedFontState(fontState, document, presentation.answerFontAssetSlot);
  const fit = fitNativeOpenResponseRuntimeAnswer({ text, responseRegion: question.responseRegion, fontFamily, fontStatus: selectedFont.status });
  return <>
    {selectedFont.status === "error" ? <p className="native-activity-font-fallback" role="alert">Selected font could not be loaded; using the default font.</p> : null}
    <div className="native-or-typography-sample" aria-label="Answer typography sample" data-font-status={selectedFont.status} data-requested-font-size={presentation.answerFontSizeMax} style={{ fontFamily, fontSize: `${presentation.answerFontSizeMax}px`, color: presentation.color, textAlign: presentation.align }}>Answer sample</div>
    <p className="native-or-toolbar-fit" role="status" data-fit={fit.fits}>{fitMessage(presentation, fit)}</p>
  </>;
}

function ConfiguredAnswerFontSize({ value, presentation, onChange }) {
  const [draft, setDraft] = useState(String(value));
  const [message, setMessage] = useState("Commit with Enter or leave the field.");
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (!draft.trim()) return setMessage("Enter a whole-number requested size; the previous value is still saved.");
    try {
      const result = commitNativeOpenResponseConfiguredFontSize(presentation, Number(draft));
      onChange(result.value); setDraft(String(result.value));
      setMessage(result.clamped ? `Clamped to ${result.value}px; allowed range is ${result.bounds.minimum}–${result.bounds.maximum}px.` : `Requested size committed at ${result.value}px.`);
    } catch (error) { setMessage(`${error.message} The previous value is still saved.`); }
  };
  return <StudioField label="Requested answer size" className="studio-quick-field studio-quick-field--wide"><input type="number" inputMode="numeric" step="1" value={draft} aria-describedby="native-or-requested-size-status" onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") { event.preventDefault(); setDraft(String(value)); setMessage("Edit cancelled; the saved value is unchanged."); } }} /><small id="native-or-requested-size-status" role="status">{message}</small></StudioField>;
}

export function NativeOpenResponseResponseControls({ document, assetUrl, question, modelAnswerText, changeResponse, updateQuestion, bookSlug, componentSlug, fonts, setAnswerFont, recordUploadedFont, onMessage }) {
  const presentation = question.responseRegion.presentation;
  return <>
    <StudioField label="Accessibility label" className="studio-quick-field studio-quick-field--wide"><input value={question.responseRegion.ariaLabel} maxLength={300} onChange={(event) => updateQuestion(question.id, (target) => { target.responseRegion.ariaLabel = event.target.value; })} /></StudioField>
    <QuickNumber label="Padding X" value={presentation.paddingX} maximum={100} onChange={(value) => changeResponse(question.id, "paddingX", Math.round(Number(value)))} />
    <QuickNumber label="Padding Y" value={presentation.paddingY} maximum={100} onChange={(value) => changeResponse(question.id, "paddingY", Math.round(Number(value)))} />
    <QuickNumber label="Line count" value={presentation.lineCount} minimum={1} maximum={20} onChange={(value) => changeResponse(question.id, "lineCount", Math.round(Number(value)))} />
    <QuickNumber label="Line width" value={presentation.lineWidth} minimum={1} maximum={question.responseRegion.area.width - 2 * presentation.paddingX} onChange={(value) => changeResponse(question.id, "lineWidth", Math.round(Number(value)))} />
    <QuickNumber label="Line spacing" value={presentation.lineSpacing} minimum={8} maximum={120} onChange={(value) => changeResponse(question.id, "lineSpacing", Math.round(Number(value)))} />
    <StudioField label="Answer sizing" className="studio-quick-field"><select aria-label="Answer sizing" value={presentation.answerSizeMode || "auto-fit"} onChange={(event) => changeResponse(question.id, "answerSizeMode", event.target.value)}><option value="auto-fit">Auto-fit</option><option value="authored">Authored size</option></select></StudioField>
    <QuickNumber label="Auto-fit minimum" value={presentation.answerFontSizeMin} minimum={1} maximum={presentation.answerFontSizeMax} disabled={presentation.answerSizeMode === "authored"} onChange={(value) => { if (value.trim() && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= presentation.answerFontSizeMax) changeResponse(question.id, "answerFontSizeMin", Number(value)); }} />
    <ConfiguredAnswerFontSize value={presentation.answerFontSizeMax} presentation={presentation} onChange={(value) => changeResponse(question.id, "answerFontSizeMax", value)} />
    <NativeActivityFontControls bookSlug={bookSlug} componentSlug={componentSlug} fonts={fonts} selectedSlot={presentation.answerFontAssetSlot} onSelect={setAnswerFont} onUploaded={recordUploadedFont} onMessage={onMessage} />
    <StudioField label="Answer text color" className="studio-quick-field"><input aria-label="Answer text color" type="color" value={presentation.color} onChange={(event) => changeResponse(question.id, "color", event.target.value)} /></StudioField>
    <StudioField label="Answer align" className="studio-quick-field"><select aria-label="Quick Answer align" value={presentation.align} onChange={(event) => changeResponse(question.id, "align", event.target.value)}><option>left</option><option>center</option><option>right</option></select></StudioField>
    <TypographyFeedback document={document} assetUrl={assetUrl} question={question} text={modelAnswerText} />
  </>;
}

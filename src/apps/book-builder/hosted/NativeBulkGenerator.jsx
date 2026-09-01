import { useId, useState } from "react";
import { Eraser, Sparkles } from "lucide-react";

import { StudioButton } from "../../../components/builder-studio/StudioControls.jsx";
import "./nativeBulkGenerator.css";

const formats = Object.freeze({
  "complete-sentences": {
    label: "Complete the Sentences",
    instruction: "Start each item with a number. Wrap exactly one answer in *asterisks*; use an unescaped slash for accepted alternatives.",
    example: "1. Turn it *down*.\n2. They turned *up/out*.",
  },
  "single-choice": {
    label: "Multiple Choice",
    instruction: "Put the numbered prompt first, then one option per line. Begin every correct option with *; two or more correct options enable multiple selection.",
    example: "1. Choose the correct meanings.\n*correct one\nwrong\n*correct two",
  },
  "open-response": {
    label: "Open Response",
    instruction: "Start each question with a number, then add one or two model-answer blocks wrapped in *asterisks*. Answer blocks may span lines.",
    example: "1. Explain your answer.\n*First model answer*\n*Optional second answer*",
  },
  "drag-drop": {
    label: "Drag & Drop",
    instruction: "Start each item with a number and wrap one word-bank label in *asterisks*. Slashes stay inside one draggable label.",
    example: "1. Turn it *down*.\n2. They turned *up/out*.",
  },
});

export function NativeBulkGenerator({ kind, hasExistingContent, onGenerate }) {
  const config = formats[kind]; const id = useId();
  const [source, setSource] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  if (!config) return null;
  const generate = () => {
    setError(""); setSummary(null);
    try {
      const result = onGenerate(source, { replaceExisting });
      setSummary(result?.summary || { headline: "Content generated", details: [] });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Content could not be generated."); }
  };
  const clear = () => { setSource(""); setError(""); setSummary(null); };
  const blocked = !source.trim() || (hasExistingContent && !replaceExisting);
  return <details className="native-bulk-generator">
    <summary><Sparkles aria-hidden="true" /> Bulk generate from text</summary>
    <div className="native-bulk-generator__body">
      <p>{config.instruction}</p>
      <pre aria-label={`${config.label} paste example`}>{config.example}</pre>
      <label htmlFor={`${id}-source`}><span>Paste numbered {config.label} content</span><textarea id={`${id}-source`} rows={10} value={source} onChange={(event) => { setSource(event.target.value); setError(""); setSummary(null); }} placeholder={config.example} /></label>
      {hasExistingContent ? <label className="native-bulk-generator__replace"><input type="checkbox" checked={replaceExisting} onChange={(event) => setReplaceExisting(event.target.checked)} /> <span><strong>Replace existing semantic content</strong><small>Questions, items, options or words and their private answers will change. Compatible panels, assets and geometry are preserved.</small></span></label> : null}
      {error ? <div className="native-bulk-generator__message is-error" role="alert"><strong>Content was not generated.</strong><span>{error}</span></div> : null}
      {summary ? <div className="native-bulk-generator__message is-success" role="status"><strong>{summary.headline}</strong>{summary.details?.length ? <ul>{summary.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}<span>Review the generated draft, then use Save Draft when ready.</span></div> : null}
      <div className="native-bulk-generator__actions"><StudioButton type="button" variant="primary" disabled={blocked} reason={!source.trim() ? "Paste numbered content first" : "Confirm replacement of existing content"} onClick={generate}><Sparkles aria-hidden="true" /> Generate content</StudioButton><StudioButton type="button" variant="ghost" disabled={!source && !error && !summary} onClick={clear}><Eraser aria-hidden="true" /> Clear source</StudioButton></div>
    </div>
  </details>;
}

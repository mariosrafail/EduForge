import { nativeOpenResponsePanelPromptIds, nativeOpenResponsePanelResponseIds } from "../../../data/native-activities/nativeOpenResponse.js";

export function PanelCompositionControls({ panel, questions, onChange }) {
  const groups = [
    { membership: "prompt", heading: "Questions / prompts on this panel", selectLabel: "Add question prompt", included: nativeOpenResponsePanelPromptIds(panel) },
    { membership: "response", heading: "Answer boxes on this panel", selectLabel: "Add answer box", included: nativeOpenResponsePanelResponseIds(panel) },
  ];
  const questionLabel = (question) => {
    const index = questions.indexOf(question) + 1;
    const preview = question.prompt.trim().replace(/\s+/g, " ").slice(0, 72) || "Untitled question";
    return `Question ${index} — ${preview}`;
  };
  const questionNumber = (question) => `Question ${questions.indexOf(question) + 1}`;
  return <section className="native-or-panel-composition" aria-label="Selected panel composition">
    {groups.map((group) => {
      const included = questions.filter((question) => group.included.includes(question.id));
      const available = questions.filter((question) => !group.included.includes(question.id));
      return <fieldset key={group.membership}><legend>{group.heading}</legend><label><span>{group.selectLabel}</span><select aria-label={group.selectLabel} value="" disabled={!available.length} onChange={(event) => { if (event.target.value) onChange(event.target.value, group.membership, true); }}><option value="">{available.length ? "Choose an existing question" : "All questions included"}</option>{available.map((question) => <option key={question.id} value={question.id}>{questionLabel(question)}</option>)}</select></label><div className="native-or-panel-memberships">{included.length ? included.map((question) => <span key={question.id}><span>{questionLabel(question)}</span><button type="button" aria-label={`Remove ${questionNumber(question)} from ${group.membership === "prompt" ? "prompts" : "answer boxes"}`} onClick={() => onChange(question.id, group.membership, false)}>Remove</button></span>) : <p>None included.</p>}</div></fieldset>;
    })}
  </section>;
}


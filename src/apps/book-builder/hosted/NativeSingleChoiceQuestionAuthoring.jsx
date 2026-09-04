import { Plus } from "lucide-react";

import { StudioButton, StudioField } from "../../../components/builder-studio/StudioControls.jsx";
import { nativeSingleChoiceCorrectOptionIds, NATIVE_SINGLE_CHOICE_LIMITS } from "../../../data/native-activities/nativeSingleChoice.js";
import { NativeBulkGenerator } from "./NativeBulkGenerator.jsx";

export function NativeSingleChoiceQuestionAuthoring({ mode, questions, selected, answer, answeredQuestionIds = new Set(), selectedQuestionId, setSelectedQuestionId, addQuestion, deleteQuestion, moveQuestion, addOption, deleteOption, moveOption, toggleAnswer, mutatePublic, generateBulk = null }) {
  const correctOptionIds = nativeSingleChoiceCorrectOptionIds(answer);
  return <>
    {mode === "content" && generateBulk ? <NativeBulkGenerator kind="single-choice" hasExistingContent={questions.length > 0} onGenerate={generateBulk} /> : null}
    {!["content", "answer-key"].includes(mode) ? null : <div className="native-or-question-workspace"><aside>
      {mode === "content" ? <StudioButton onClick={addQuestion} disabled={questions.length >= NATIVE_SINGLE_CHOICE_LIMITS.questions}><Plus aria-hidden="true" />Add Question</StudioButton> : null}
      {questions.map((question, index) => <button type="button" key={question.id} aria-current={selectedQuestionId === question.id ? "true" : undefined} onClick={() => setSelectedQuestionId(question.id)}><strong>Question {index + 1}</strong><span>{question.prompt.trim() || "Untitled question"}</span>{answeredQuestionIds.has(question.id) ? null : <em>Needs answer</em>}<code>{question.id}</code></button>)}
    </aside>
    {selected ? <section className="native-or-question-editor"><header><strong>Question {questions.indexOf(selected) + 1}</strong><code>{selected.id}</code>{mode === "content" ? <div><button type="button" disabled={questions.indexOf(selected) === 0} onClick={() => moveQuestion(-1)}>Move Up</button><button type="button" disabled={questions.indexOf(selected) === questions.length - 1} onClick={() => moveQuestion(1)}>Move Down</button><button type="button" onClick={() => deleteQuestion(selected.id)}>Delete Question</button></div> : null}</header>
      <StudioField label="Prompt"><textarea readOnly={mode === "answer-key"} maxLength={NATIVE_SINGLE_CHOICE_LIMITS.promptLength} value={selected.prompt} onChange={(event) => mutatePublic((next) => { next.parts[0].interaction.questions.find((question) => question.id === selected.id).prompt = event.target.value; })} /></StudioField>
      <fieldset><legend>{mode === "answer-key" ? "Private correct answers" : "Options"} {answer ? <small>· {correctOptionIds.length > 1 ? "Multiple selection" : "Single selection"}</small> : <em>· Needs answer</em>}</legend>
        {selected.options.map((option, index) => mode === "answer-key" ? <label className="native-single-choice-answer-option" key={option.id}><input type="checkbox" aria-label={`Option ${index + 1}: ${option.text || "Untitled option"}`} checked={correctOptionIds.includes(option.id)} onChange={() => toggleAnswer(option.id)} /><span><strong>Option {index + 1}</strong><span>{option.text || "Untitled option"}</span><small>{correctOptionIds.includes(option.id) ? "Selected correct answer" : "Select as correct"}</small></span></label> : <div className="native-single-choice-option-editor" key={option.id}><span aria-hidden="true">{index + 1}</span><textarea rows={2} aria-label={`Option ${index + 1}`} maxLength={NATIVE_SINGLE_CHOICE_LIMITS.optionTextLength} value={option.text} onChange={(event) => mutatePublic((next) => { next.parts[0].interaction.questions.find((question) => question.id === selected.id).options.find((item) => item.id === option.id).text = event.target.value; })} /><button type="button" aria-label={`Move option ${index + 1} up`} disabled={index === 0} onClick={() => moveOption(option.id, -1)}>↑</button><button type="button" aria-label={`Move option ${index + 1} down`} disabled={index === selected.options.length - 1} onClick={() => moveOption(option.id, 1)}>↓</button><button type="button" disabled={selected.options.length <= NATIVE_SINGLE_CHOICE_LIMITS.optionsMinimum} onClick={() => deleteOption(option.id)}>Delete</button><code>{option.id}</code></div>)}
      </fieldset>
      {mode === "content" ? <StudioButton disabled={selected.options.length >= NATIVE_SINGLE_CHOICE_LIMITS.optionsMaximum} onClick={addOption}><Plus aria-hidden="true" />Add Option</StudioButton> : null}
    </section> : <p>No questions yet. Add a question to begin.</p>}</div>}
  </>;
}

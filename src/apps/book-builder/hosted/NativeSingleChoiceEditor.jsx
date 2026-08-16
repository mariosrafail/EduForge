import { useEffect, useMemo, useState } from "react";
import { NativeSingleChoiceStudentSurface } from "../../../components/native-single-choice/NativeSingleChoiceStudentSurface.jsx";
import { NativeSingleChoiceTeacherSurface } from "../../../components/native-single-choice/NativeSingleChoiceTeacherSurface.jsx";
import { createNativeChildId } from "../../../data/native-activities/nativeChildIdentity.js";
import { assessNativeSingleChoiceReadiness, createNativeSingleChoiceQuestion, NATIVE_SINGLE_CHOICE_LIMITS } from "../../../data/native-activities/nativeSingleChoice.js";
import { getBuilderContent } from "./builderContentApi.js";
import { saveNativeActivityPair } from "./builderNativeActivityApi.js";

const clone = (value) => structuredClone(value);

export function NativeSingleChoiceEditor({ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange = () => {}, onSaved = () => {} }) {
  const [state, setState] = useState({ kind: "loading", publicRevision: 0, teacherRevision: 0, message: "" });
  const [publicDraft, setPublicDraft] = useState(null);
  const [teacherDraft, setTeacherDraft] = useState(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [preview, setPreview] = useState("student");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-public", documentKey: activityId }, { signal: controller.signal }),
      getBuilderContent({ bookSlug, componentSlug, resource: "native-activity-teacher", documentKey: activityId }, { signal: controller.signal }),
    ]).then(([publicValue, teacherValue]) => {
      if (controller.signal.aborted) return;
      setPublicDraft(publicValue.document); setTeacherDraft(teacherValue.document); setSelectedQuestionId(publicValue.document.parts[0].interaction.questions[0]?.id || null);
      setState({ kind: "ready", publicRevision: publicValue.revision, teacherRevision: teacherValue.revision, message: "Saved draft" });
    }).catch((error) => { if (!controller.signal.aborted) setState({ kind: "error", message: error.message }); });
    return () => controller.abort();
  }, [activityId, bookSlug, componentSlug]);
  const changed = () => { setDirty(true); onDirtyChange(true); };
  const mutatePublic = (mutator) => { setPublicDraft((current) => { const next = clone(current); mutator(next); return next; }); changed(); };
  const mutateTeacher = (mutator) => { setTeacherDraft((current) => { const next = clone(current); mutator(next); return next; }); changed(); };
  const questions = publicDraft?.parts[0].interaction.questions || [];
  const selected = questions.find((question) => question.id === selectedQuestionId) || null;
  const answer = teacherDraft?.parts[0].solution.correctAnswers.find((item) => item.questionId === selectedQuestionId) || null;
  const readiness = useMemo(() => publicDraft && teacherDraft ? assessNativeSingleChoiceReadiness(publicDraft, teacherDraft) : null, [publicDraft, teacherDraft]);
  const addQuestion = () => {
    const questionId = createNativeChildId("q"); const optionIds = [createNativeChildId("opt"), createNativeChildId("opt")];
    mutatePublic((next) => next.parts[0].interaction.questions.push(createNativeSingleChoiceQuestion(questionId, optionIds)));
    mutateTeacher((next) => next.parts[0].solution.correctAnswers.push({ questionId, correctOptionId: optionIds[0] }));
    setSelectedQuestionId(questionId);
  };
  const deleteQuestion = (questionId) => {
    if (!globalThis.confirm("Delete this question and its private correct answer?")) return;
    const index = questions.findIndex((question) => question.id === questionId);
    mutatePublic((next) => { next.parts[0].interaction.questions = next.parts[0].interaction.questions.filter((question) => question.id !== questionId); });
    mutateTeacher((next) => { next.parts[0].solution.correctAnswers = next.parts[0].solution.correctAnswers.filter((item) => item.questionId !== questionId); });
    setSelectedQuestionId(questions[index + 1]?.id || questions[index - 1]?.id || null);
  };
  const moveQuestion = (offset) => {
    const index = questions.findIndex((question) => question.id === selectedQuestionId); const target = index + offset;
    if (target < 0 || target >= questions.length) return;
    mutatePublic((next) => { const list = next.parts[0].interaction.questions; [list[index], list[target]] = [list[target], list[index]]; });
    mutateTeacher((next) => { const list = next.parts[0].solution.correctAnswers; [list[index], list[target]] = [list[target], list[index]]; });
  };
  const addOption = () => mutatePublic((next) => next.parts[0].interaction.questions.find((question) => question.id === selectedQuestionId).options.push({ id: createNativeChildId("opt"), text: "" }));
  const deleteOption = (optionId) => {
    const remaining = selected.options.filter((option) => option.id !== optionId);
    mutatePublic((next) => { next.parts[0].interaction.questions.find((question) => question.id === selectedQuestionId).options = remaining; });
    if (answer.correctOptionId === optionId && remaining[0]) mutateTeacher((next) => { next.parts[0].solution.correctAnswers.find((item) => item.questionId === selectedQuestionId).correctOptionId = remaining[0].id; });
  };
  const moveOption = (optionId, offset) => mutatePublic((next) => { const list = next.parts[0].interaction.questions.find((question) => question.id === selectedQuestionId).options; const index = list.findIndex((option) => option.id === optionId); const target = index + offset; if (target >= 0 && target < list.length) [list[index], list[target]] = [list[target], list[index]]; });
  const save = async () => {
    setState((current) => ({ ...current, saving: true, message: "Saving…" }));
    try {
      const value = await saveNativeActivityPair({ bookSlug, componentSlug, activityId, expectedPublicRevision: state.publicRevision, expectedTeacherRevision: state.teacherRevision, publicDocument: publicDraft, teacherDocument: teacherDraft });
      setPublicDraft(value.publicDocument); setTeacherDraft(value.teacherDocument); setDirty(false); onDirtyChange(false); onSaved(value.publicRevision);
      setState({ kind: "ready", publicRevision: value.publicRevision, teacherRevision: value.teacherRevision, saving: false, message: "Draft saved." });
    } catch (error) { setState((current) => ({ ...current, saving: false, message: error.status === 409 ? "This draft changed elsewhere. Reload before saving." : error.message })); }
  };
  if (state.kind === "loading") return <section className="native-activity-foundation" role="status">Loading native Multiple Choice…</section>;
  if (state.kind === "error" || !publicDraft || !teacherDraft) return <section className="native-activity-foundation" role="alert">{state.message}</section>;
  return <section className="native-activity-foundation native-single-choice-editor">
    <header><div><span>Native draft · publishable when complete</span><h2>{publicDraft.metadata.title}</h2></div><dl><div><dt>Stable ID</dt><dd><code>{activityId}</code></dd></div><div><dt>Kind</dt><dd>Multiple Choice</dd></div><div><dt>Placement</dt><dd>{placementLabel}</dd></div><div><dt>Revisions</dt><dd>Public {state.publicRevision} · Teacher {state.teacherRevision}</dd></div></dl></header>
    <div className="native-activity-foundation-fields"><label><span>Activity title</span><input maxLength={300} value={publicDraft.metadata.title} onChange={(event) => mutatePublic((next) => { next.metadata.title = event.target.value; })} /></label><label><span>Visible instruction</span><textarea maxLength={2000} value={publicDraft.metadata.visibleInstructionText} onChange={(event) => mutatePublic((next) => { next.metadata.visibleInstructionText = event.target.value; })} /></label></div>
    <div className="native-or-question-workspace"><aside><button type="button" disabled={questions.length >= NATIVE_SINGLE_CHOICE_LIMITS.questions} onClick={addQuestion}>Add Question</button>{questions.map((question, index) => <button type="button" key={question.id} aria-current={selectedQuestionId === question.id ? "true" : undefined} onClick={() => setSelectedQuestionId(question.id)}>Question {index + 1}<code>{question.id}</code></button>)}</aside>
    {selected ? <section className="native-or-question-editor"><header><strong>Question {questions.indexOf(selected) + 1}</strong><code>{selected.id}</code><div><button type="button" disabled={questions.indexOf(selected) === 0} onClick={() => moveQuestion(-1)}>Move Up</button><button type="button" disabled={questions.indexOf(selected) === questions.length - 1} onClick={() => moveQuestion(1)}>Move Down</button><button type="button" onClick={() => deleteQuestion(selected.id)}>Delete Question</button></div></header><label><span>Prompt</span><textarea maxLength={NATIVE_SINGLE_CHOICE_LIMITS.promptLength} value={selected.prompt} onChange={(event) => mutatePublic((next) => { next.parts[0].interaction.questions.find((question) => question.id === selected.id).prompt = event.target.value; })} /></label><fieldset><legend>Options and private correct answer</legend>{selected.options.map((option, index) => <div key={option.id}><input type="radio" name={`correct-${selected.id}`} aria-label={`Mark option ${index + 1} correct`} checked={answer?.correctOptionId === option.id} onChange={() => mutateTeacher((next) => { next.parts[0].solution.correctAnswers.find((item) => item.questionId === selected.id).correctOptionId = option.id; })} /><input maxLength={NATIVE_SINGLE_CHOICE_LIMITS.optionTextLength} value={option.text} onChange={(event) => mutatePublic((next) => { next.parts[0].interaction.questions.find((question) => question.id === selected.id).options.find((item) => item.id === option.id).text = event.target.value; })} /><button type="button" disabled={index === 0} onClick={() => moveOption(option.id, -1)}>↑</button><button type="button" disabled={index === selected.options.length - 1} onClick={() => moveOption(option.id, 1)}>↓</button><button type="button" disabled={selected.options.length <= 2} onClick={() => deleteOption(option.id)}>Delete</button><code>{option.id}</code></div>)}</fieldset><button type="button" disabled={selected.options.length >= NATIVE_SINGLE_CHOICE_LIMITS.optionsMaximum} onClick={addOption}>Add Option</button></section> : <p>No questions yet. Add a question to begin.</p>}</div>
    <div className="native-or-preview"><div className="native-or-preview-toggle"><button type="button" aria-pressed={preview === "student"} onClick={() => setPreview("student")}>Student Preview</button><button type="button" aria-pressed={preview === "teacher"} onClick={() => setPreview("teacher")}>Teacher Preview</button></div><h3>{publicDraft.metadata.title}</h3>{publicDraft.metadata.visibleInstructionText ? <p>{publicDraft.metadata.visibleInstructionText}</p> : null}{preview === "student" ? <NativeSingleChoiceStudentSurface document={publicDraft} /> : <NativeSingleChoiceTeacherSurface publicDocument={publicDraft} teacherDocument={teacherDraft} />}</div>
    <aside className="native-or-readiness" role="status"><strong>{readiness.ready ? "Draft is future-publish ready" : "Incomplete draft"}</strong>{readiness.issues.length ? <ul>{readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}</aside>
    <footer><span data-dirty={dirty || undefined} role="status">{dirty ? "Unsaved changes" : state.message}</span><button type="button" disabled={!dirty || state.saving || !publicDraft.metadata.title.trim()} onClick={save}>{state.saving ? "Saving…" : "Save Draft"}</button></footer>
  </section>;
}

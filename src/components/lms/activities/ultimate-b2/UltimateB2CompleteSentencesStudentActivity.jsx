import { GripVertical, RotateCcw, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import Modal from "../../../ui/Modal.jsx";
import { getUltimateB2ReadingExerciseRuntime } from "../../../../data/ultimate-b2/readingExerciseRuntimeData.js";
import {
  completeSentencesProgress,
  completeSentencesWordBank,
  moveCompleteSentencesWord,
} from "./completeSentencesStudentModel.js";
import "./ultimateB2ExerciseActivities.css";

const dragMime = "application/x-ultimate-b2-complete-sentences-word";

export function UltimateB2CompleteSentencesStudentActivity({
  activity,
  runtime: runtimeOverride = null,
  answers = {},
  frozen = false,
  submitting = false,
  submitted = false,
  serverResult = null,
  submitError = "",
  canSubmit = true,
  confirmBeforeSubmit = true,
  replaceAnswers,
  onSubmit,
}) {
  const runtime = runtimeOverride || getUltimateB2ReadingExerciseRuntime(activity);
  const [selectedWordId, setSelectedWordId] = useState("");
  const [draggingWordId, setDraggingWordId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const words = useMemo(() => completeSentencesWordBank(runtime), [runtime]);
  const progress = completeSentencesProgress(answers, runtime);
  const wordByText = new Map(words.map((word) => [word.text, word]));
  const selectedWord = words.find((word) => word.id === selectedWordId) || null;
  const selectedIsPlaced = selectedWord ? Object.values(answers).includes(selectedWord.text) : false;

  useEffect(() => {
    if (frozen || submitted || !canSubmit) {
      setSelectedWordId("");
      setDraggingWordId("");
      setConfirmOpen(false);
    }
  }, [canSubmit, frozen, submitted]);

  if (!runtime) return null;

  const moveWord = (wordId, questionId = null) => {
    if (frozen || !wordId) return;
    replaceAnswers?.((current) => moveCompleteSentencesWord(current, runtime, wordId, questionId));
    setSelectedWordId("");
    setDraggingWordId("");
  };
  const wordIdFromDrop = (event) => event.dataTransfer.getData(dragMime) || event.dataTransfer.getData("text/plain") || draggingWordId;
  const beginDrag = (event, wordId) => {
    if (frozen) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(dragMime, wordId);
    event.dataTransfer.setData("text/plain", wordId);
    setDraggingWordId(wordId);
    setSelectedWordId(wordId);
  };
  const confirmSubmit = async () => {
    const saved = await onSubmit?.();
    if (saved !== false) setConfirmOpen(false);
  };

  return (
    <section className="ultimate-b2-complete-sentences-student" data-student-complete-sentences={runtime.activityId} data-response-schema-version="1">
      <header className="complete-sentences-student-heading">
        <span className="complete-sentences-student-number">4</span>
        <div><h2>Complete the sentences</h2><p>Drag each word or phrase to the correct blank. On touch devices, tap a word and then tap a blank.</p></div>
        <strong>{progress.answered}/{progress.total}</strong>
      </header>

      <section
        className={`complete-sentences-word-bank ${draggingWordId ? "is-dragging" : ""}`}
        aria-label="Draggable word bank"
        onDragOver={(event) => { if (!frozen) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
        onDrop={(event) => { event.preventDefault(); moveWord(wordIdFromDrop(event)); }}
      >
        <div className="complete-sentences-word-bank-heading">
          <div><strong>Word bank</strong><span>Each answer can be used once.</span></div>
          {selectedIsPlaced && <button type="button" disabled={frozen} onClick={() => moveWord(selectedWord.id)}><Undo2 size={16} /> Return selected word</button>}
        </div>
        <div className="complete-sentences-word-bank-items">
          {words.map((word) => {
            const used = Object.values(answers).includes(word.text);
            return (
              <button
                key={word.id}
                type="button"
                className={`${selectedWordId === word.id ? "is-selected" : ""} ${used ? "is-used" : ""}`.trim()}
                data-word-id={word.id}
                draggable={!frozen && !used}
                disabled={frozen || used}
                aria-pressed={selectedWordId === word.id}
                onDragStart={(event) => beginDrag(event, word.id)}
                onDragEnd={() => setDraggingWordId("")}
                onClick={() => setSelectedWordId((current) => current === word.id ? "" : word.id)}
              ><GripVertical size={16} aria-hidden="true" /><span>{word.text}</span></button>
            );
          })}
        </div>
      </section>

      <div className="complete-sentences-student-list">
        <div className="complete-sentences-student-row is-example">
          <b>{runtime.example.number}</b>
          <p>{runtime.example.before}<span className="complete-sentences-example-chip">{runtime.example.exampleText}</span>{runtime.example.after}</p>
          <small>Example</small>
        </div>
        {runtime.sentences.map((sentence) => {
          const value = answers[sentence.questionId] || "";
          const placedWord = wordByText.get(value) || null;
          const selected = placedWord && selectedWordId === placedWord.id;
          return (
            <div className="complete-sentences-student-row" key={sentence.id} data-question-id={sentence.questionId}>
              <b>{sentence.number}</b>
              <p>
                {sentence.before}
                <span
                  className={`complete-sentences-drop-shell ${value ? "is-filled" : ""} ${selected ? "is-selected" : ""} ${draggingWordId ? "is-drop-ready" : ""}`.trim()}
                  onDragOver={(event) => { if (!frozen) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
                  onDrop={(event) => { event.preventDefault(); moveWord(wordIdFromDrop(event), sentence.questionId); }}
                >
                  <button
                    type="button"
                    className="complete-sentences-drop-target"
                    disabled={frozen}
                    data-drop-question-id={sentence.questionId}
                    aria-label={value ? `${sentence.number}: ${value}. Tap to move this answer.` : `${sentence.number}: empty answer blank`}
                    draggable={!frozen && Boolean(placedWord)}
                    onDragStart={(event) => placedWord && beginDrag(event, placedWord.id)}
                    onDragEnd={() => setDraggingWordId("")}
                    onClick={() => {
                      if (selectedWordId) moveWord(selectedWordId, sentence.questionId);
                      else if (placedWord) setSelectedWordId(placedWord.id);
                    }}
                  >{value || <span>Drop answer</span>}</button>
                  {placedWord && !frozen && <button type="button" className="complete-sentences-return-word" aria-label={`Return ${value} to word bank`} onClick={() => moveWord(placedWord.id)}><RotateCcw size={14} /></button>}
                </span>
                {sentence.after}
              </p>
            </div>
          );
        })}
      </div>

      <footer className="complete-sentences-student-actions">
        {canSubmit && !submitted && <button className="primary-action" type="button" disabled={!progress.complete || submitting || frozen} onClick={() => confirmBeforeSubmit ? setConfirmOpen(true) : onSubmit?.()}>{submitting ? "Submitting…" : "Done"}</button>}
        {canSubmit && !progress.complete && !submitted && <span>Place all {progress.total} answers before submitting.</span>}
        {submitted && <div className="complete-sentences-score" role="status"><strong>{Number.isFinite(serverResult?.correctCount) ? `Score: ${serverResult.correctCount}/${serverResult.totalCount}` : "Submitted"}</strong>{Number.isFinite(serverResult?.scorePercent) && <span>{serverResult.scorePercent}%</span>}</div>}
        {submitError && <div className="inline-status error" role="alert">{submitError}</div>}
      </footer>

      <Modal
        open={confirmOpen}
        title="Are you sure you want to submit?"
        description="Your answers will be locked and sent to your teacher."
        onClose={() => { if (!submitting) setConfirmOpen(false); }}
        className="complete-sentences-submit-modal"
        backdropClassName="complete-sentences-submit-backdrop"
        footer={<><button className="secondary-action" type="button" disabled={submitting} onClick={() => setConfirmOpen(false)}>Cancel</button><button className="primary-action" type="button" disabled={submitting} onClick={confirmSubmit}>{submitting ? "Submitting…" : "Submit"}</button></>}
      >
        <p>You answered {progress.answered} of {progress.total} sentences.</p>
      </Modal>
    </section>
  );
}

import { useState } from "react";
import { Card } from "../../Shared.jsx";
import { readingExercise3, readingExercise3Options } from "../ultimateB2ActivityContent.js";
import { FeedbackRows } from "./shared/FeedbackRows.jsx";
import { ReadingAudioPlayer } from "./shared/ReadingAudioPlayer.jsx";
import { ReadingContextPanel } from "./shared/ReadingContextPanel.jsx";

export function ReadingExercise3({ mode, onSubmit }) {
  const [selectedGap, setSelectedGap] = useState(1);
  const [selectedOption, setSelectedOption] = useState("");
  const [draggingOption, setDraggingOption] = useState("");
  const [dragOverGap, setDragOverGap] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(null);
  const isLocked = mode === "teacher-preview" || Boolean(submittedRows);

  const submit = () => {
    const rows = readingExercise3.map((item) => {
      const studentAnswer = answers[item.gap] || "";
      return {
        ...item,
        studentAnswer,
        correct: studentAnswer === item.answer,
      };
    });
    setSubmittedRows(rows);
    onSubmit?.({ activityKey: "reading-ex3", score: Math.round((rows.filter((row) => row.correct).length / rows.length) * 100) });
  };

  const placeOption = (optionId, targetGap = selectedGap) => {
    if (isLocked || !optionId || !targetGap) return;
    setAnswers((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([, value]) => value !== optionId));
      next[targetGap] = optionId;
      return next;
    });
    setSelectedOption("");
    setSelectedGap((current) => (current === targetGap ? Math.min(targetGap + 1, 6) : current));
  };

  const clearGap = (gap) => {
    if (isLocked) return;
    setAnswers((current) => {
      const next = { ...current };
      delete next[gap];
      return next;
    });
    setSelectedGap(gap);
  };

  const handleGapClick = (gap) => {
    if (selectedOption && !isLocked) {
      placeOption(selectedOption, gap);
      return;
    }
    setSelectedGap(gap);
  };

  const handleGapDrop = (gap, optionId) => {
    placeOption(optionId, gap);
    setDraggingOption("");
    setDragOverGap(null);
  };

  const unusedOptions = readingExercise3Options.filter((option) => !Object.values(answers).includes(option.id));
  const displayedOptions = submittedRows ? readingExercise3Options : unusedOptions;
  const extraOption = readingExercise3Options.find((option) => option.id === "D");

  return (
    <div className="reading-ex3-shell">
      {/* TODO: add synced reading highlights in a later phase. */}
      <ReadingAudioPlayer />
      <Card className="reading-ex3-header">
        <span className="eyebrow">Students Book / Unit 2 Reading</span>
        <h2>Exercise 3</h2>
        <p>Read the text again and insert the missing sentences. There is one extra sentence which you do not need to use.</p>
        <div className="inline-status">Drag each sentence into the correct gap. One sentence is extra.</div>
        {selectedOption && !submittedRows && (
          <div id="selected-reading-option" className="inline-status success">
            Selected sentence {selectedOption}. Click a gap in the text to place it.
          </div>
        )}
      </Card>
      <div className="reading-ex3-workspace">
        <ReadingContextPanel
          gapAnswers={answers}
          selectedGap={selectedGap}
          selectedOption={selectedOption}
          dragOverGap={dragOverGap}
          onGapClick={handleGapClick}
          onGapDrop={handleGapDrop}
          onGapDragOver={setDragOverGap}
          onGapDragLeave={(gap) => setDragOverGap((current) => (current === gap ? null : current))}
          onRemoveGap={clearGap}
          submittedRows={submittedRows}
          disabled={mode === "teacher-preview"}
        />
        <Card className="missing-sentence-panel">
          <span className="eyebrow">Sentence bank</span>
          <h3>Missing sentences</h3>
          <div className="sentence-option-list">
            {displayedOptions.map((option) => {
              const usedAt = Object.entries(answers).find(([, value]) => value === option.id)?.[0];
              return (
                <button
                  key={option.id}
                  type="button"
                  draggable={!isLocked}
                  disabled={isLocked}
                  className={[
                    usedAt ? "used" : "",
                    selectedOption === option.id ? "selected" : "",
                    draggingOption === option.id ? "dragging" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => setSelectedOption((current) => (current === option.id ? "" : option.id))}
                  onDoubleClick={() => placeOption(option.id)}
                  onDragStart={(event) => {
                    if (isLocked) return;
                    event.dataTransfer.setData("text/plain", option.id);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingOption(option.id);
                  }}
                  onDragEnd={() => {
                    setDraggingOption("");
                    setDragOverGap(null);
                  }}
                  data-sound-click="tab"
                >
                  <b>{option.id}</b>
                  <span>{option.text}</span>
                  {usedAt && <small>Placed in gap {usedAt}</small>}
                </button>
              );
            })}
          </div>
        </Card>
      </div>
      {mode === "student" && !submittedRows && <button className="primary-action reading-ex3-submit" type="button" onClick={submit} data-sound-click="submit">Submit Exercise 3</button>}
      {submittedRows && (
        <Card className="reading-ex3-results">
          <div className="inline-status success">Score: {submittedRows.filter((row) => row.correct).length}/{submittedRows.length}</div>
          <div className="reading-feedback-list">
            {submittedRows.map((row) => {
              const studentOption = readingExercise3Options.find((option) => option.id === row.studentAnswer);
              const correctOption = readingExercise3Options.find((option) => option.id === row.answer);
              return (
                <article key={row.gap} className={row.correct ? "correct" : "wrong"}>
                  <strong>Gap {row.gap}</strong>
                  <span>Your answer: {row.studentAnswer ? `${row.studentAnswer}. ${studentOption?.text}` : "No answer"}</span>
                  <small>Correct answer: {row.answer}. {correctOption?.text}</small>
                </article>
              );
            })}
          </div>
          {extraOption && <div className="inline-status">Extra unused sentence: {extraOption.id}. {extraOption.text}</div>}
        </Card>
      )}
    </div>
  );
}

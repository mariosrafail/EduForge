import { useState } from "react";
import { Card } from "../../Shared.jsx";
import { buildScoredAssignmentResult } from "../../../../utils/assignmentSubmission.js";
import { buildNormalizedSubmissionAnswers, getNormalizedStudentsBookActivity, scoreNormalizedStudentsBookActivity } from "../../../../data/ultimate-b2/normalizedStudentsBookActivities.js";
import { ReadingAudioPlayer } from "./shared/ReadingAudioPlayer.jsx";
import { ReadingContextPanel } from "./shared/ReadingContextPanel.jsx";

const activity = getNormalizedStudentsBookActivity("reading-ex3");
const optionLabel = (optionId = "") => optionId.split("-option-").at(-1);
const readingOptions = (activity?.questions?.[0]?.options || []).map((option) => ({ id: optionLabel(option.id), optionId: option.id, text: option.value }));
const readingQuestions = activity?.questions || [];

export function ReadingExercise3({ mode, onSubmit }) {
  const [selectedGap, setSelectedGap] = useState(1);
  const [selectedOption, setSelectedOption] = useState("");
  const [draggingOption, setDraggingOption] = useState("");
  const [dragOverGap, setDragOverGap] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(null);
  const isLocked = mode === "teacher-preview" || Boolean(submittedRows);

  if (!activity) return <Card><p className="inline-status">Normalized activity data could not be loaded.</p></Card>;

  const submit = () => {
    const normalizedAnswers = Object.fromEntries(readingQuestions.map((question, index) => {
      const label = answers[index + 1] || "";
      return [question.id, readingOptions.find((option) => option.id === label)?.optionId || ""];
    }));
    const rows = scoreNormalizedStudentsBookActivity(activity, normalizedAnswers).map((row, index) => {
      return {
        gap: index + 1,
        studentAnswer: optionLabel(row.studentAnswer[0]),
        answer: optionLabel(row.answer[0]),
        correct: row.correct,
      };
    });
    setSubmittedRows(rows);
    onSubmit?.(buildScoredAssignmentResult({ activityKey: "reading-ex3", activityId: activity.id, answers: buildNormalizedSubmissionAnswers(activity, normalizedAnswers), rows }));
  };

  const placeOption = (optionId, targetGap = selectedGap) => {
    if (isLocked || !optionId || !targetGap) return;
    setAnswers((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([, value]) => value !== optionId));
      next[targetGap] = optionId;
      return next;
    });
    setSelectedOption("");
    setSelectedGap((current) => (current === targetGap ? Math.min(targetGap + 1, readingQuestions.length) : current));
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

  const unusedOptions = readingOptions.filter((option) => !Object.values(answers).includes(option.id));
  const displayedOptions = submittedRows ? readingOptions : unusedOptions;
  const extraOption = readingOptions.find((option) => option.id === "D");

  return (
    <div className="reading-ex3-shell">
      {/* TODO: add synced reading highlights in a later phase. */}
      <ReadingAudioPlayer />
      <Card className="reading-ex3-header">
        <span className="eyebrow">Students Book / Unit 2 Reading</span>
        <h2>{activity?.title || "Exercise 3"}</h2>
        <p>{activity?.instructions}</p>
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
          readingContext={activity?.presentationData?.readingContext || []}
          options={readingOptions}
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
              const studentOption = readingOptions.find((option) => option.id === row.studentAnswer);
              const correctOption = readingOptions.find((option) => option.id === row.answer);
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
          {mode === "student" && <button className="secondary-action" type="button" onClick={() => {
            setAnswers({});
            setSubmittedRows(null);
            setSelectedGap(1);
            setSelectedOption("");
          }}>Try again</button>}
        </Card>
      )}
    </div>
  );
}

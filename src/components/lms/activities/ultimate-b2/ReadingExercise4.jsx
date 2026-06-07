import { useState } from "react";
import { Card } from "../../Shared.jsx";
import { readingExercise4 } from "../ultimateB2ActivityContent.js";
import { FeedbackRows } from "./shared/FeedbackRows.jsx";

export function ReadingExercise4({ mode, onSubmit }) {
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(null);

  const submit = () => {
    const rows = readingExercise4.map((item) => {
      const studentAnswer = answers[item.id] || "";
      return { ...item, studentAnswer, correct: studentAnswer === item.answer };
    });
    setSubmittedRows(rows);
    onSubmit?.({ activityKey: "reading-ex4", score: Math.round((rows.filter((row) => row.correct).length / rows.length) * 100) });
  };

  return (
    <div className="standalone-reading-exercise">
      <Card className="circle-words-panel">
        <span className="eyebrow">Students Book / Unit 2 Reading</span>
        <h2>Exercise 4</h2>
        <p>Circle the correct words.</p>
        <div className="circle-word-list">
          {readingExercise4.map((item, index) => {
            const submitted = submittedRows?.find((row) => row.id === item.id);
            const selectedAnswer = answers[item.id] || "";
            const blankState = submitted ? (submitted.correct ? "correct" : "wrong") : selectedAnswer ? "filled" : "empty";
            return (
              <article key={item.id} className={submitted ? (submitted.correct ? "correct" : "wrong") : ""}>
                <span>{index + 1}</span>
                <p className="inline-choice-sentence">
                  {item.before}{" "}
                  <span className={`inline-choice-blank ${blankState}`} aria-live="polite">
                    {selectedAnswer || "blank"}
                  </span>
                  {" "}{item.after}
                </p>
                <div className="inline-choice-options" aria-label={`Options for question ${index + 1}`}>
                  {item.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={Boolean(submittedRows) || mode === "teacher-preview"}
                      className={`inline-choice-chip ${selectedAnswer === option ? "selected" : ""}`}
                      aria-pressed={selectedAnswer === option}
                      data-correct={submittedRows && option === item.answer ? "true" : undefined}
                      onClick={() => setAnswers((current) => ({ ...current, [item.id]: option }))}
                      data-sound-click="tab"
                    >
                      {option}
                    </button>
                  ))}
                </div>
                {submitted && <small>Your answer: {submitted.studentAnswer || "No answer"} / Correct answer: {submitted.answer}</small>}
              </article>
            );
          })}
        </div>
        {mode === "student" && !submittedRows && <button className="primary-action" type="button" onClick={submit} data-sound-click="submit">Submit Exercise 4</button>}
        {submittedRows && (
          <>
            <div className="inline-status success">Score: {submittedRows.filter((row) => row.correct).length}/{submittedRows.length}</div>
            <FeedbackRows rows={submittedRows.map((row) => ({ ...row, question: `${row.before} ${row.answer} ${row.after}` }))} />
          </>
        )}
      </Card>
    </div>
  );
}

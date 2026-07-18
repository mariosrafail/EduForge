import { useState } from "react";
import { buildScoredAssignmentResult } from "../../../../../utils/assignmentSubmission.js";
import { buildNormalizedSubmissionAnswers, scoreNormalizedStudentsBookActivity } from "../../../../../data/ultimate-b2/normalizedStudentsBookActivities.js";
import { Card } from "../../../Shared.jsx";
import { FeedbackRows } from "./FeedbackRows.jsx";

function optionValue(question, optionId) {
  return question.options.find((option) => option.id === optionId)?.value || "";
}

export function NormalizedInlineChoiceActivity({ activity, mode = "student", onSubmit }) {
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(null);

  if (!activity) return <Card><p className="inline-status">Normalized activity data could not be loaded.</p></Card>;
  if (!activity.questions?.length) return <Card><p className="inline-status">This activity is awaiting editorial completion.</p></Card>;

  const submit = () => {
    const rows = scoreNormalizedStudentsBookActivity(activity, answers);
    setSubmittedRows(rows);
    onSubmit?.(buildScoredAssignmentResult({
      activityKey: activity.aliases?.[0] || activity.id,
      activityId: activity.id,
      answers: buildNormalizedSubmissionAnswers(activity, answers),
      rows,
    }));
  };

  const reset = () => {
    setAnswers({});
    setSubmittedRows(null);
  };

  return (
    <div className="standalone-reading-exercise">
      <Card className="circle-words-panel">
        <span className="eyebrow">Students Book / Unit {activity.unitNumber}</span>
        <h2>{activity.title}</h2>
        <p>{activity.instructions}</p>
        <div className="circle-word-list">
          {activity.questions.map((question, index) => {
            const submitted = submittedRows?.find((row) => row.id === question.id);
            const selectedOptionId = answers[question.id] || "";
            const selectedValue = optionValue(question, selectedOptionId);
            const blankState = submitted ? (submitted.correct ? "correct" : "wrong") : selectedOptionId ? "filled" : "empty";
            return (
              <article key={question.id} className={submitted ? (submitted.correct ? "correct" : "wrong") : ""}>
                <span>{index + 1}</span>
                <p className="inline-choice-sentence">
                  {question.presentation?.before || question.prompt}{" "}
                  {question.presentation && <span className={`inline-choice-blank ${blankState}`} aria-live="polite">{selectedValue || "blank"}</span>}
                  {question.presentation?.after ? ` ${question.presentation.after}` : ""}
                </p>
                <div className="inline-choice-options" aria-label={`Options for question ${index + 1}`}>
                  {question.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={Boolean(submittedRows) || mode === "teacher-preview"}
                      className={`inline-choice-chip ${selectedOptionId === option.id ? "selected" : ""}`}
                      aria-pressed={selectedOptionId === option.id}
                      data-correct={submittedRows && submitted?.answer.includes(option.id) ? "true" : undefined}
                      onClick={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                      data-sound-click="tab"
                    >
                      {option.value}
                    </button>
                  ))}
                </div>
                {submitted && <small>Your answer: {selectedValue || "No answer"} / Correct answer: {optionValue(question, submitted.answer[0])}</small>}
              </article>
            );
          })}
        </div>
        {mode === "student" && !submittedRows && <button className="primary-action" type="button" onClick={submit} data-sound-click="submit">Submit answers</button>}
        {submittedRows && (
          <>
            <div className="inline-status success">Score: {submittedRows.filter((row) => row.correct).length}/{submittedRows.length}</div>
            <FeedbackRows rows={submittedRows.map((row) => ({ ...row, studentAnswer: optionValue(activity.questions.find((question) => question.id === row.id), row.studentAnswer[0]), answer: optionValue(activity.questions.find((question) => question.id === row.id), row.answer[0]) }))} />
            {mode === "student" && <button className="secondary-action" type="button" onClick={reset}>Try again</button>}
          </>
        )}
      </Card>
    </div>
  );
}

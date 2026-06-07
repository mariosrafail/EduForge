import { useState } from "react";
import { BookOpen } from "lucide-react";
import grammarRulesImage from "../../../../assets/books/ultimate-b2/grammar-rules.jpg";
import { Card } from "../../Shared.jsx";
import { ImageZoomModal } from "../../shared/BookImageFrame.jsx";
import { grammarExercise4 } from "../ultimateB2ActivityContent.js";
import { FeedbackRows } from "./shared/FeedbackRows.jsx";
import { isSentenceAnswerCorrect } from "./shared/typedAnswerUtils.js";

export function GrammarRulesHelp({ imageSrc = grammarRulesImage, buttonLabel = "Grammar rules" }) {
  const [isGrammarHelpOpen, setIsGrammarHelpOpen] = useState(false);

  return (
    <div className="grammar-help">
      <button className="grammar-help-button" type="button" onClick={() => setIsGrammarHelpOpen(true)} data-sound-click="tab">
        <BookOpen size={16} />
        <span>{buttonLabel}</span>
      </button>
      {isGrammarHelpOpen && (
        <ImageZoomModal
          title="Grammar rules"
          subtitle="Review the rules before you continue the exercise."
          imageSrc={imageSrc}
          alt="Grammar rules reference"
          onClose={() => setIsGrammarHelpOpen(false)}
        />
      )}
    </div>
  );
}

export function GrammarExercise4({ mode, onSubmit }) {
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(null);

  const submit = () => {
    const rows = grammarExercise4.map((item) => {
      const studentAnswer = answers[item.id] || "";
      return {
        ...item,
        studentAnswer,
        correct: isSentenceAnswerCorrect(studentAnswer, item.answer),
      };
    });
    setSubmittedRows(rows);
    onSubmit?.({ activityKey: "grammar-ex4", score: Math.round((rows.filter((row) => row.correct).length / rows.length) * 100) });
  };

  return (
    <>
      <div className="card-heading">
        <div>
          <span className="eyebrow">Ultimate B2 Grammar Book</span>
          <h2>Join the sentences</h2>
          <p>Join the sentences. Use the past simple, the past continuous and the words in bold.</p>
        </div>
      </div>
      <div className="grammar-joining-list">
        {grammarExercise4.map((item, index) => {
          const submitted = submittedRows?.find((row) => row.id === item.id);
          return (
            <label key={item.id} className={`grammar-joining-row ${submitted ? (submitted.correct ? "correct" : "wrong") : ""}`}>
              <span>{index + 1}</span>
              <div>
                <strong>{item.firstSentence}</strong>
                <strong>{item.secondSentence}</strong>
                <small>Use <b>{item.connector}</b></small>
              </div>
              <textarea
                aria-label={`Answer ${index + 1}`}
                value={answers[item.id] || ""}
                disabled={Boolean(submittedRows) || mode === "teacher-preview"}
                rows={2}
                placeholder="Type the joined sentence"
                onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value }))}
              />
              {submitted && (
                <small className="grammar-joining-feedback">
                  Student answer: {submitted.studentAnswer || "No answer"} / Correct answer: {submitted.answer}
                </small>
              )}
            </label>
          );
        })}
      </div>
      <GrammarRulesHelp />
      {mode === "student" && !submittedRows && <button className="primary-action" type="button" onClick={submit} data-sound-click="submit">Submit sentences</button>}
      {submittedRows && <FeedbackRows rows={submittedRows} />}
    </>
  );
}

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { ultimateB2GrammarRulesImage } from "virtual:ultimate-b2-media-assets";
import { useBookAsset } from "../../../../hooks/useBookAsset.js";
import { Card } from "../../Shared.jsx";
import { ImageZoomModal } from "../../shared/BookImageFrame.jsx";
import { grammarExercise4 } from "../ultimateB2ActivityContent.js";
import { FeedbackRows } from "./shared/FeedbackRows.jsx";
import { isTypedAnswerCorrect } from "./shared/typedAnswerUtils.js";
import { buildScoredAssignmentResult } from "../../../../utils/assignmentSubmission.js";

export function GrammarRulesHelp({ imageSrc = null, buttonLabel = "Grammar rules" }) {
  const asset = useBookAsset(ultimateB2GrammarRulesImage.logicalKey, { devFallbackUrl: ultimateB2GrammarRulesImage.devFallbackUrl || ultimateB2GrammarRulesImage.localUrl });
  const resolvedImage = imageSrc || asset.url;
  const [isGrammarHelpOpen, setIsGrammarHelpOpen] = useState(false);

  return (
    <div className="grammar-help">
      <button className="grammar-help-button" type="button" onClick={() => setIsGrammarHelpOpen(true)} disabled={!resolvedImage} data-sound-click="tab">
        <BookOpen size={16} />
        <span>{buttonLabel}</span>
      </button>
      {!resolvedImage && <small>Grammar Book media is unavailable online until a later controlled import.</small>}
      {isGrammarHelpOpen && (
        <ImageZoomModal
          title="Grammar rules"
          subtitle="Review the rules before you continue the exercise."
          imageSrc={resolvedImage}
          alt="Grammar rules reference"
          onClose={() => setIsGrammarHelpOpen(false)}
        />
      )}
    </div>
  );
}

export function GrammarExercise4({ mode, onSubmit, questions = grammarExercise4, activityKey = "grammar-ex4", activityId = null }) {
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(null);

  const submit = () => {
    const rows = questions.map((item) => {
      const studentAnswer = answers[item.id] || "";
      return {
        ...item,
        studentAnswer,
        correct: isTypedAnswerCorrect(studentAnswer, item),
      };
    });
    setSubmittedRows(rows);
    onSubmit?.(buildScoredAssignmentResult({ activityKey, activityId, answers, rows }));
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
        {questions.map((item, index) => {
          const submitted = submittedRows?.find((row) => row.id === item.id);
          return (
            <label key={item.id} className={`grammar-joining-row ${submitted ? (submitted.correct ? "correct" : "wrong") : ""}`}>
              <span>{index + 1}</span>
              <div>
                <strong>{item.firstSentence || item.prompt}</strong>
                {item.secondSentence && <strong>{item.secondSentence}</strong>}
                {item.connector && <small>Use <b>{item.connector}</b></small>}
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

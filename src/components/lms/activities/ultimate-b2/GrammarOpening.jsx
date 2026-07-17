import { useState } from "react";
import { ultimateB2GrammarRulesImage } from "virtual:ultimate-b2-media-assets";
import { useBookAsset } from "../../../../hooks/useBookAsset.js";
import { Card } from "../../Shared.jsx";
import { BookImageFrame } from "../../shared/BookImageFrame.jsx";
import { grammarOpening } from "../ultimateB2ActivityContent.js";
import { ChoiceSet } from "./shared/ChoiceSet.jsx";
import { FeedbackRows } from "./shared/FeedbackRows.jsx";
import { scoreAnswers } from "./shared/activityScoringUtils.js";
import { GrammarExercise4, GrammarRulesHelp } from "./GrammarExercise4.jsx";

export function GrammarOpening({ activityKey, mode, onSubmit }) {
  const grammarRules = useBookAsset(ultimateB2GrammarRulesImage.logicalKey, { devFallbackUrl: ultimateB2GrammarRulesImage.devFallbackUrl || ultimateB2GrammarRulesImage.localUrl });
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(null);
  const questions = grammarOpening;

  const submit = () => {
    const rows = scoreAnswers(questions, answers);
    setSubmittedRows(rows);
    onSubmit?.({ activityKey, score: Math.round((rows.filter((row) => row.correct).length / rows.length) * 100) });
  };

  return (
    <Card>
      {grammarRules.url ? (
        <BookImageFrame
          title="Grammar rules"
          subtitle="Review the rules before you start. You can open them larger anytime."
          imageSrc={grammarRules.url}
          alt="Grammar rules reference"
          zoomTitle="Grammar rules"
        />
      ) : <div className="book-page-missing">Grammar Book media has not been migrated for online delivery.</div>}
      {activityKey === "grammar-ex4" ? (
        <GrammarExercise4 mode={mode} onSubmit={onSubmit} />
      ) : (
        <>
          <div className="card-heading">
            <div>
              <span className="eyebrow">Ultimate B2 Grammar Book</span>
              <h2>Opening exercise</h2>
              <p>Complete the Unit 2 grammar warm-up. Use the rules popup as your support tool before answering.</p>
            </div>
          </div>
          <ChoiceSet
            questions={questions}
            answers={answers}
            setAnswers={setAnswers}
            disabled={Boolean(submittedRows) || mode === "teacher-preview"}
            submittedRows={submittedRows}
          />
          <GrammarRulesHelp />
          {mode === "student" && !submittedRows && <button className="primary-action" type="button" onClick={submit} data-sound-click="submit">Submit grammar</button>}
          {submittedRows && <FeedbackRows rows={submittedRows} />}
        </>
      )}
    </Card>
  );
}

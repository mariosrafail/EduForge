import { useState } from "react";
import { Headphones } from "lucide-react";
import { ultimateB2GrammarRulesImage, ultimateB2WorkbookListeningAudio } from "virtual:ultimate-b2-media-assets";
import { useBookAsset } from "../../../../hooks/useBookAsset.js";
import { BookImageFrame } from "../../shared/BookImageFrame.jsx";
import { Card, Tag } from "../../Shared.jsx";
import { QUIZ_DURATION_SECONDS, listeningGapFillItems } from "../ultimateB2ActivityContent.js";
import { ChoiceSet } from "./shared/ChoiceSet.jsx";
import { FeedbackRows } from "./shared/FeedbackRows.jsx";
import { scoreAnswers } from "./shared/activityScoringUtils.js";
import { formatTime } from "./shared/MediaTime.js";
import { VideoIntroScreen } from "./VideoIntroScreen.jsx";
import { ListeningGapFillExercise } from "./ListeningPage20.jsx";
import { GrammarExercise4, GrammarRulesHelp } from "./GrammarExercise4.jsx";
import { buildScoredAssignmentResult } from "../../../../utils/assignmentSubmission.js";

function dbQuestionsToChoiceQuestions(questions = []) {
  return questions.map((question, index) => ({
    id: question.id || `db-question-${index + 1}`,
    question: question.question || question.prompt,
    prompt: question.prompt || question.question,
    options: (question.options || []).map((option) => option.text || option.value || option.option_text),
    answer: question.answer || (question.options || []).find((option) => option.correct || option.is_correct)?.text || "",
    feedback: question.feedbackJson?.feedback || question.feedback_json?.feedback || question.feedback || "",
  }));
}

function dbQuestionsToGapFillItems(questions = []) {
  return questions.map((question, index) => {
    const contentJson = question.contentJson || question.content_json || {};
    const feedbackJson = question.feedbackJson || question.feedback_json || {};
    const correctOption = (question.options || []).find((option) => option.correct || option.is_correct);
    const answer = question.answer || contentJson.answer || correctOption?.text || correctOption?.value || correctOption?.option_text || "";
    const acceptedAnswers = contentJson.acceptedAnswers || contentJson.accepted_answers || feedbackJson.acceptedAnswers || feedbackJson.accepted_answers;

    return {
      id: question.id || `db-gap-${index + 1}`,
      prompt: question.prompt || question.question || contentJson.prompt || contentJson.question,
      answer,
      acceptedAnswers: Array.isArray(acceptedAnswers) ? acceptedAnswers : [answer].filter(Boolean),
      feedback: feedbackJson.feedback || question.feedback || "",
    };
  });
}

export function DatabaseActivity({ activity, mode, onSubmit, onNextActivity }) {
  const grammarRules = useBookAsset(ultimateB2GrammarRulesImage.logicalKey, { devFallbackUrl: ultimateB2GrammarRulesImage.devFallbackUrl || ultimateB2GrammarRulesImage.localUrl });
  const listeningAudio = useBookAsset(ultimateB2WorkbookListeningAudio.logicalKey, { devFallbackUrl: ultimateB2WorkbookListeningAudio.devFallbackUrl || ultimateB2WorkbookListeningAudio.localUrl });
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(null);
  const [watched, setWatched] = useState(false);
  const activityType = activity.activityType || activity.activity_type;
  const contentJson = activity.contentJson || activity.content_json || {};
  const questions = dbQuestionsToChoiceQuestions(activity.questions || []);
  const gapFillQuestions = dbQuestionsToGapFillItems(activity.questions || []);
  const demoActivityKey = activity.demoActivityKey || contentJson.demoActivityKey || activity.slug;

  const submit = () => {
    const rows = scoreAnswers(questions, answers);
    setSubmittedRows(rows);
    onSubmit?.(buildScoredAssignmentResult({
      activityKey: activity.demoActivityKey || contentJson.demoActivityKey || activity.slug || activity.id,
      activityId: activity.id,
      answers,
      rows,
    }));
  };

  if (activityType === "media_video") {
    return <VideoIntroScreen mode={mode} onSubmit={onSubmit} onNextActivity={onNextActivity} />;
  }

  if (demoActivityKey === "listening-page-20" || activityType === "listening_gap_fill" || activityType === "typed_gap_fill" || activityType === "audio_gap_fill") {
    return (
      <ListeningGapFillExercise
        mode={mode}
        onSubmit={onSubmit}
        activity={activity}
        questions={gapFillQuestions.length ? gapFillQuestions : listeningGapFillItems}
      />
    );
  }

  if (demoActivityKey === "grammar-ex4" || activityType === "sentence_transformation" || activityType === "typed_sentence_joining" || activityType === "grammar_sentence_joining") {
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
        <GrammarExercise4
          mode={mode}
          onSubmit={onSubmit}
          questions={gapFillQuestions}
          activityKey={demoActivityKey}
          activityId={activity.id}
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="card-heading">
        <div>
          <span className="eyebrow">Database-backed activity</span>
          <h2>{activity.title}</h2>
          <p>{activity.instructions}</p>
        </div>
      </div>
      {activityType === "listening_multiple_choice" && (
        <div className="ultimate-audio-placeholder">
          <Headphones size={28} />
          <div>
            <strong>Unit 2 listening audio</strong>
            <span>{contentJson.duration || "01:40"} / Ultimate B2 local demo audio asset</span>
          </div>
          {listeningAudio.url ? <audio controls preload="metadata" src={listeningAudio.url} /> : <small>Audio not migrated for online delivery.</small>}
        </div>
      )}
      {activityType === "timed_quiz" && <Tag tone="gold">Timer: {formatTime(activity.timerSeconds || activity.timer_seconds || QUIZ_DURATION_SECONDS)}</Tag>}
      <ChoiceSet
        questions={questions}
        answers={answers}
        setAnswers={setAnswers}
        disabled={Boolean(submittedRows) || mode === "teacher-preview"}
        submittedRows={submittedRows}
      />
      {(contentJson.grammar_rules || contentJson.grammarRules) && <GrammarRulesHelp />}
      {mode === "student" && !submittedRows && <button className="primary-action" type="button" onClick={submit} data-sound-click="submit">Submit answers</button>}
      {submittedRows && <FeedbackRows rows={submittedRows} />}
    </Card>
  );
}

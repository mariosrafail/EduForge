import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Timer } from "lucide-react";
import { Card, Tag } from "../../Shared.jsx";
import { QUIZ_DURATION_SECONDS, quiz1Questions, quiz2Questions, quizQuestions } from "../ultimateB2ActivityContent.js";
import { ChoiceSet } from "./shared/ChoiceSet.jsx";
import { FeedbackRows } from "./shared/FeedbackRows.jsx";
import { scoreAnswers } from "./shared/activityScoringUtils.js";
import { formatTime } from "./shared/MediaTime.js";

const quizConfigs = {
  "quiz-1": {
    title: "Quiz 1: Reading and Vocabulary",
    shortTitle: "Quiz 1",
    subtitle: "Timed Unit 1 check, 20 minutes",
    questions: quiz1Questions,
    storageKey: "hh_lms_quiz_1_attempt_completed",
  },
  "quiz-2": {
    title: "Quiz 2",
    shortTitle: "Quiz 2",
    subtitle: "Timed test, 20 minutes",
    questions: quiz2Questions,
    storageKey: "hh_lms_quiz_2_attempt_completed",
  },
};

export function QuizActivity({ activityKey = "quiz-2", mode, onSubmit }) {
  const quizConfig = quizConfigs[activityKey] || quizConfigs["quiz-2"];
  const questions = quizConfig.questions?.length ? quizConfig.questions : quizQuestions;
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(() => {
    if (mode !== "student" || typeof window === "undefined") return null;
    try {
      const storedAttempt = window.localStorage.getItem(quizConfig.storageKey);
      if (!storedAttempt) return null;
      const parsedAttempt = JSON.parse(storedAttempt);
      return Array.isArray(parsedAttempt?.rows) ? parsedAttempt.rows : [];
    } catch {
      return [];
    }
  });
  const [testStarted, setTestStarted] = useState(false);
  const [remaining, setRemaining] = useState(QUIZ_DURATION_SECONDS);
  const [timeExpired, setTimeExpired] = useState(false);
  const answeredCount = Object.keys(answers).filter((key) => answers[key]).length;
  const correctCount = submittedRows?.filter((row) => row.correct).length || 0;
  const hasCompletedAttempt = Boolean(submittedRows);
  const displayedAnsweredCount = submittedRows ? submittedRows.filter((row) => row.studentAnswer).length : answeredCount;
  const timerTone = remaining <= 60 ? "danger" : remaining <= 300 ? "warning" : "steady";

  const submit = useCallback((options = {}) => {
    if (submittedRows) return;
    if (!options.autoSubmit) {
      const shouldSubmit = window.confirm("Submit test?\n\nYou will not be able to change your answers after submitting.");
      if (!shouldSubmit) return;
    }
    const rows = scoreAnswers(questions, answers);
    setSubmittedRows(rows);
    if (options.autoSubmit) setTimeExpired(true);
    if (mode === "student") {
      try {
        // TODO: Clear the quiz attempt key in dev tools to reset this demo-only one-attempt guard.
        window.localStorage.setItem(quizConfig.storageKey, JSON.stringify({ completed: true, rows }));
      } catch {
        // Demo persistence is best-effort; submittedRows still enforces this attempt for the current session.
      }
    }
    onSubmit?.({ activityKey, score: Math.round((rows.filter((row) => row.correct).length / rows.length) * 100) });
  }, [activityKey, answers, mode, onSubmit, questions, quizConfig.storageKey, submittedRows]);

  useEffect(() => {
    if (mode !== "student" || submittedRows || !testStarted) return undefined;
    const timer = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode, submittedRows, testStarted]);

  useEffect(() => {
    if (remaining === 0 && !submittedRows && mode === "student" && testStarted) submit({ autoSubmit: true });
  }, [remaining, submittedRows, mode, submit, testStarted]);

  const startTest = () => {
    setRemaining(QUIZ_DURATION_SECONDS);
    setTestStarted(true);
  };

  const floatingTimer = testStarted && !submittedRows ? (
    <div className={`quiz-floating-timer ${timerTone}`} role="status" aria-live="polite">
      <div className="quiz-floating-timer-main">
        <span><Timer size={14} /> {quizConfig.shortTitle}</span>
        <strong>{formatTime(remaining)}</strong>
      </div>
      <div className="quiz-floating-timer-actions">
        <small>Answered {displayedAnsweredCount}/{questions.length}</small>
        {mode === "student" && (
          <button type="button" onClick={() => submit()} data-sound-click="submit">
            Submit
          </button>
        )}
      </div>
    </div>
  ) : null;

  if (!hasCompletedAttempt && !testStarted) {
    return (
      <Card>
        <div className="ultimate-quiz-start-card">
          <div className="ultimate-quiz-start-copy">
            <span className="eyebrow"><Timer size={15} /> {mode === "teacher-preview" ? "Teacher preview" : "Ultimate B2 Test Book"}</span>
            <h2>{quizConfig.title}</h2>
            <p>{quizConfig.subtitle}</p>
          </div>
          <div className="ultimate-quiz-ready-badge">
            <Timer size={18} />
            <strong>{formatTime(QUIZ_DURATION_SECONDS)}</strong>
            <span>ready</span>
          </div>
          <ul className="ultimate-quiz-instructions">
            {[
              "You have 20 minutes to complete this test.",
              "The timer will start when you click \"Start test\".",
              "You can only take this test once.",
              `Answer all ${questions.length} multiple choice questions.`,
              "You can change your answers before submitting.",
              "When time is up, the test will be submitted automatically.",
              "Do not refresh or leave the page while taking the test.",
            ].map((instruction) => (
              <li key={instruction}>
                <CheckCircle2 size={17} />
                <span>{instruction}</span>
              </li>
            ))}
          </ul>
          {mode === "teacher-preview" && (
            <div className="inline-status">Teacher preview is read-only. Previewing questions does not start a student attempt.</div>
          )}
          <div className="ultimate-quiz-start-actions">
            <button className="primary-action" type="button" onClick={startTest} data-sound-click="submit">
              {mode === "teacher-preview" ? "Preview questions" : "Start test"}
            </button>
            <span>Make sure you are ready before you begin.</span>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="ultimate-quiz-card">
        <div className={`ultimate-quiz-head ${submittedRows ? "submitted" : ""} ${timerTone}`}>
          <div>
            <span className="eyebrow"><Timer size={15} /> Ultimate B2 Test Book</span>
            <h2>{quizConfig.title}</h2>
            <p>{submittedRows ? "This test has already been submitted." : "Choose the correct answer. Submit when ready or when time is up."}</p>
          </div>
          <div className="ultimate-quiz-status-actions">
            <strong className={remaining === 0 ? "time-up" : ""}>{submittedRows ? "Submitted" : formatTime(remaining)}</strong>
            <span>Answered {displayedAnsweredCount}/{questions.length}</span>
            {mode === "student" && !submittedRows && (
              <button className="secondary-action" type="button" onClick={() => submit()} data-sound-click="submit">Submit test</button>
            )}
          </div>
        </div>
        {timeExpired && <div className="inline-status warning">Time is up. The test has been submitted.</div>}
        {hasCompletedAttempt && <div className="inline-status success">This test has already been submitted.</div>}
        <div className="ultimate-quiz-progress-row">
          <Tag tone="blue">Question {Math.min(displayedAnsweredCount + 1, questions.length)} of {questions.length}</Tag>
          <Tag tone="gold">Answered {displayedAnsweredCount}/{questions.length}</Tag>
        </div>
        <ChoiceSet
          questions={questions}
          answers={answers}
          setAnswers={setAnswers}
          disabled={Boolean(submittedRows) || mode === "teacher-preview" || remaining === 0}
          submittedRows={submittedRows}
        />
        {mode === "student" && !submittedRows && <button className="primary-action" type="button" onClick={() => submit()} data-sound-click="submit">Submit test</button>}
        {submittedRows && (
          <>
            {submittedRows.length > 0 ? (
              <>
                <div className="inline-status success">Completed. Score: {correctCount}/{submittedRows.length}</div>
                <FeedbackRows rows={submittedRows} />
              </>
            ) : (
              <div className="inline-status warning">Review details are unavailable for this stored demo attempt.</div>
            )}
          </>
        )}
      </Card>
      {floatingTimer && typeof document !== "undefined" ? createPortal(floatingTimer, document.body) : floatingTimer}
    </>
  );
}

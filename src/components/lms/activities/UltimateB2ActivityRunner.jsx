import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Clock3, Headphones, Play, Timer, X } from "lucide-react";
import { findUltimateB2Exercise } from "../../../data/ultimateB2DemoData.js";
import { Card, SectionTitle, Tag } from "../Shared.jsx";
import {
  QUIZ_DURATION_SECONDS,
  grammarExercise4,
  grammarOpening,
  listeningQuestions,
  quizQuestions,
  readingExercise3,
  readingExercise4,
  readingText,
} from "./ultimateB2ActivityContent.js";

function scoreAnswers(questions, answers) {
  return questions.map((question) => ({
    ...question,
    studentAnswer: answers[question.id] || "",
    correct: answers[question.id] === question.answer,
  }));
}

function FeedbackRows({ rows }) {
  return (
    <div className="ultimate-feedback-list">
      {rows.map((row) => (
        <article key={row.id} className={row.correct ? "correct" : "wrong"}>
          <div>
            <strong>{row.question || row.prompt}</strong>
            <span>Student answer: {row.studentAnswer || "No answer"}</span>
            <small>Correct answer: {row.answer}</small>
            {row.feedback && <p>{row.feedback}</p>}
          </div>
          <b>{row.correct ? "Correct" : "Needs review"}</b>
        </article>
      ))}
    </div>
  );
}

function ChoiceSet({ questions, answers, setAnswers, disabled = false }) {
  return (
    <div className="ultimate-question-list">
      {questions.map((question, index) => (
        <fieldset key={question.id} className="ultimate-question-card" disabled={disabled}>
          <legend>{index + 1}. {question.question || question.prompt}</legend>
          {question.options.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name={question.id}
                checked={answers[question.id] === option}
                onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
              />
              <span>{option}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

function ReadingTextPanel() {
  return (
    <Card className="ultimate-reading-text">
      <span className="eyebrow"><BookOpen size={15} /> Reading text</span>
      <h2>A Young Inventor's Unexpected Journey</h2>
      <small>Demo text, replace with supplied Ultimate B2 reading text.</small>
      {readingText.map((paragraph, index) => (
        <p key={paragraph}><b>Paragraph {index + 1}</b> {paragraph}</p>
      ))}
    </Card>
  );
}

function VideoIntro({ mode, onSubmit }) {
  const [watched, setWatched] = useState(false);

  return (
    <Card className="ultimate-media-card">
      <div className="ultimate-video-placeholder">
        <Play size={42} />
        <strong>Unit 2 Video Intro</strong>
        <span>Video placeholder, replace with supplied Ultimate B2 video asset</span>
        <Tag tone="gold">02:15</Tag>
      </div>
      <p>This short introduction prepares students for the Unit 2 reading topic and key ideas.</p>
      {mode === "student" && (
        <button className="primary-action" type="button" onClick={() => { setWatched(true); onSubmit?.({ activityKey: "video-intro", score: 100 }); }} data-sound-click="submit">
          Mark video as watched
        </button>
      )}
      {watched && <div className="inline-status success">Video watched.</div>}
    </Card>
  );
}

function ReadingExercise({ activityKey, mode, onSubmit }) {
  const isExercise4 = activityKey === "reading-ex4";
  const questions = isExercise4 ? readingExercise4 : readingExercise3;
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(null);

  const submit = () => {
    const rows = scoreAnswers(questions, answers);
    setSubmittedRows(rows);
    onSubmit?.({ activityKey, score: Math.round((rows.filter((row) => row.correct).length / rows.length) * 100) });
  };

  return (
    <div className="ultimate-activity-grid">
      <ReadingTextPanel />
      <Card>
        <span className="eyebrow">Students Book / Unit 2 Reading</span>
        <h2>{isExercise4 ? "Exercise 4" : "Exercise 3"}</h2>
        <p>{isExercise4 ? "Choose the paragraph or evidence-based answer for each item." : "Choose the best answer for each comprehension question."}</p>
        <ChoiceSet questions={questions} answers={answers} setAnswers={setAnswers} disabled={Boolean(submittedRows) || mode === "teacher-preview"} />
        {mode === "student" && !submittedRows && <button className="primary-action" type="button" onClick={submit} data-sound-click="submit">Submit answers</button>}
        {submittedRows && <FeedbackRows rows={submittedRows} />}
      </Card>
    </div>
  );
}

function ListeningExercise({ mode, onSubmit }) {
  const [played, setPlayed] = useState(false);
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(null);

  const submit = () => {
    const rows = scoreAnswers(listeningQuestions, answers);
    setSubmittedRows(rows);
    onSubmit?.({ activityKey: "listening-page-20", score: Math.round((rows.filter((row) => row.correct).length / rows.length) * 100) });
  };

  return (
    <Card>
      <span className="eyebrow"><Headphones size={15} /> Ultimate B2 Workbook</span>
      <h2>Workbook page 20: Listening Exercise</h2>
      <div className="ultimate-audio-placeholder">
        <Headphones size={28} />
        <div>
          <strong>Audio placeholder, replace with supplied Ultimate B2 audio asset</strong>
          <span>01:40 / mock play control</span>
        </div>
        <button className="secondary-action compact-action" type="button" onClick={() => setPlayed(true)} data-sound-click="tab">{played ? "Replay" : "Play"}</button>
      </div>
      {played && <div className="inline-status success">Audio sample marked as played.</div>}
      <p>Listen to the Unit 2 conversation and answer the questions. The real audio asset can be swapped in later.</p>
      <ChoiceSet questions={listeningQuestions} answers={answers} setAnswers={setAnswers} disabled={Boolean(submittedRows) || mode === "teacher-preview"} />
      {mode === "student" && !submittedRows && <button className="primary-action" type="button" onClick={submit} data-sound-click="submit">Submit listening</button>}
      {submittedRows && <FeedbackRows rows={submittedRows} />}
    </Card>
  );
}

function GrammarRulesPopup({ onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="grammar-rules-backdrop" role="dialog" aria-modal="true" aria-labelledby="grammar-rules-title">
      <Card className="grammar-rules-modal">
        <button className="grammar-rules-close" type="button" onClick={onClose} aria-label="Close grammar rules"><X size={18} /></button>
        <h2 id="grammar-rules-title">Unit 2 Grammar Rules</h2>
        <ul>
          <li>Use past perfect to show an earlier past action: <b>had + past participle</b>.</li>
          <li>Use <b>so that</b> to explain purpose.</li>
          <li>Use participle clauses to connect actions clearly in formal writing.</li>
          <li>After <b>wish</b> about the past, use <b>had + past participle</b>.</li>
        </ul>
      </Card>
    </div>
  );
}

function GrammarExercise({ activityKey, mode, onSubmit }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(null);
  const questions = activityKey === "grammar-ex4" ? grammarExercise4 : grammarOpening;

  const submit = () => {
    const rows = scoreAnswers(questions, answers);
    setSubmittedRows(rows);
    onSubmit?.({ activityKey, score: Math.round((rows.filter((row) => row.correct).length / rows.length) * 100) });
  };

  return (
    <Card>
      <div className="card-heading">
        <div>
          <span className="eyebrow">Ultimate B2 Grammar Book</span>
          <h2>{activityKey === "grammar-ex4" ? "Exercise 4" : "Opening exercise"}</h2>
          <p>Complete the Unit 2 grammar items. Use the rules popup before submitting.</p>
        </div>
        <button className="secondary-action" type="button" onClick={() => setRulesOpen(true)} data-sound-click="tab">View grammar rules</button>
      </div>
      <ChoiceSet questions={questions} answers={answers} setAnswers={setAnswers} disabled={Boolean(submittedRows) || mode === "teacher-preview"} />
      {mode === "student" && !submittedRows && <button className="primary-action" type="button" onClick={submit} data-sound-click="submit">Submit grammar</button>}
      {submittedRows && <FeedbackRows rows={submittedRows} />}
      {rulesOpen && <GrammarRulesPopup onClose={() => setRulesOpen(false)} />}
    </Card>
  );
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

function TimedQuiz({ mode, onSubmit }) {
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(null);
  const [remaining, setRemaining] = useState(QUIZ_DURATION_SECONDS);

  const submit = () => {
    const rows = scoreAnswers(quizQuestions, answers);
    setSubmittedRows(rows);
    onSubmit?.({ activityKey: "quiz-2", score: Math.round((rows.filter((row) => row.correct).length / rows.length) * 100) });
  };

  useEffect(() => {
    if (mode !== "student" || submittedRows) return undefined;
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
  }, [mode, submittedRows]);

  useEffect(() => {
    if (remaining === 0 && !submittedRows && mode === "student") submit();
  }, [remaining, submittedRows, mode]);

  return (
    <Card>
      <div className="ultimate-quiz-head">
        <div>
          <span className="eyebrow"><Timer size={15} /> Ultimate B2 Test Book</span>
          <h2>Quiz 2</h2>
          <p>20-minute timed test. Submit when ready or when time is up.</p>
        </div>
        <strong className={remaining === 0 ? "time-up" : ""}>{formatTime(remaining)}</strong>
      </div>
      {remaining === 0 && <div className="inline-status warning">Time is up. The test has been submitted.</div>}
      <Tag tone="blue">Question {Math.min(Object.keys(answers).length + 1, quizQuestions.length)} of {quizQuestions.length}</Tag>
      <ChoiceSet questions={quizQuestions} answers={answers} setAnswers={setAnswers} disabled={Boolean(submittedRows) || mode === "teacher-preview" || remaining === 0} />
      {mode === "student" && !submittedRows && <button className="primary-action" type="button" onClick={submit} data-sound-click="submit">Submit test</button>}
      {submittedRows && (
        <>
          <div className="inline-status success">Completed. Score: {submittedRows.filter((row) => row.correct).length}/{submittedRows.length}</div>
          <FeedbackRows rows={submittedRows} />
        </>
      )}
    </Card>
  );
}

function ActivityBody({ activityKey, mode, onSubmit }) {
  if (activityKey === "video-intro") return <VideoIntro mode={mode} onSubmit={onSubmit} />;
  if (activityKey === "reading-ex3" || activityKey === "reading-ex4") return <ReadingExercise activityKey={activityKey} mode={mode} onSubmit={onSubmit} />;
  if (activityKey === "listening-page-20") return <ListeningExercise mode={mode} onSubmit={onSubmit} />;
  if (activityKey === "grammar-opening" || activityKey === "grammar-ex4") return <GrammarExercise activityKey={activityKey} mode={mode} onSubmit={onSubmit} />;
  if (activityKey === "quiz-2") return <TimedQuiz mode={mode} onSubmit={onSubmit} />;
  return <Card><h2>Demo activity not configured</h2><p>This activity key is ready for future content mapping.</p></Card>;
}

export function UltimateB2ActivityRunner({ activityKey, exerciseId, mode = "student", onBack, onSubmit }) {
  const resolved = findUltimateB2Exercise(activityKey || exerciseId);
  const exercise = resolved?.exercise;
  const key = exercise?.demoActivityKey || activityKey || exerciseId;

  return (
    <div className="ultimate-activity-runner">
      <button className="secondary-action compact-action" type="button" onClick={onBack} data-sound-click="back">Back</button>
      <SectionTitle
        eyebrow={mode === "teacher-preview" ? "Teacher preview" : "Demo activity"}
        title={exercise?.title || "Ultimate B2 activity"}
        text={resolved ? `Ultimate B2 package > ${resolved.component.title} > ${resolved.unit.title} > ${exercise.title}` : "Ultimate B2 package > Unit 2 demo activity"}
        action={<div className="ultimate-runner-tags"><Tag tone="gold">Ultimate B2</Tag><Tag tone="blue">{resolved?.unit.title || "Unit 2"}</Tag><Tag tone="green">{mode === "teacher-preview" ? "Preview" : "Student mode"}</Tag></div>}
      />
      {resolved && (
        <div className="ultimate-breadcrumb">
          <span>Ultimate B2 package</span>
          <span>{resolved.component.title}</span>
          <span>{resolved.unit.title}</span>
          <strong>{exercise.title}</strong>
        </div>
      )}
      {mode === "teacher-preview" && <div className="inline-status">Teacher preview is read-only. Students can submit answers in student mode.</div>}
      <ActivityBody activityKey={key} mode={mode} onSubmit={onSubmit} />
    </div>
  );
}

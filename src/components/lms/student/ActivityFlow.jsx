import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Send } from "lucide-react";
import { scoreActivity, scoreLesson } from "../../../utils/courseScoring.js";
import { Card, Tag } from "../Shared.jsx";
import { useSoundEffects } from "../../../context/SoundContext.jsx";
import { ActivityProgress } from "./ActivityProgress.jsx";
import { LessonCompletionSummary } from "./LessonCompletionSummary.jsx";
import { ActivityShell } from "./activities/ActivityShell.jsx";
import { ActivityFeedback } from "./activities/ActivityFeedback.jsx";
import { DragDropGapFillActivity } from "./activities/DragDropGapFillActivity.jsx";
import { LineMatchingActivity } from "./activities/LineMatchingActivity.jsx";
import { MultipleChoiceActivity } from "./activities/MultipleChoiceActivity.jsx";

function resultMapFromResults(results) {
  return Object.fromEntries(results.map((result) => [result.id, result]));
}

function ActivityRenderer({ activity, answers, onChange, submitted, resultMap }) {
  if (activity.type === "gap-fill") {
    return <DragDropGapFillActivity activity={activity} answers={answers} onChange={onChange} submitted={submitted} resultMap={resultMap} />;
  }
  if (activity.type === "line-matching") {
    return <LineMatchingActivity activity={activity} answers={answers} onChange={onChange} submitted={submitted} resultMap={resultMap} />;
  }
  if (activity.type === "multiple-choice") {
    return <MultipleChoiceActivity activity={activity} answers={answers} onChange={onChange} submitted={submitted} resultMap={resultMap} />;
  }
  return null;
}

export function ActivityFlow({ course, onSubmission, submitLesson, previewMode = false }) {
  const { playSound } = useSoundEffects();
  const activities = course.lesson.activities;
  const [activeIndex, setActiveIndex] = useState(0);
  const [answersByActivity, setAnswersByActivity] = useState({});
  const [submittedActivityIds, setSubmittedActivityIds] = useState(new Set());
  const [completedActivityIds, setCompletedActivityIds] = useState(new Set());
  const [lessonComplete, setLessonComplete] = useState(false);
  const activeActivity = activities[activeIndex];
  const activeAnswers = answersByActivity[activeActivity.id] || {};
  const activeResults = useMemo(() => scoreActivity(activeActivity, activeAnswers), [activeActivity, activeAnswers]);
  const activeScore = {
    total: activeResults.length,
    correct: activeResults.filter((result) => result.correct).length,
  };
  const activeSubmitted = submittedActivityIds.has(activeActivity.id);
  const lessonScore = useMemo(() => scoreLesson(course.lesson, answersByActivity), [course.lesson, answersByActivity]);
  const activityGuidance = activeScore.correct === activeScore.total
    ? activeActivity.feedback?.correct
    : activeActivity.feedback?.revision || activeActivity.feedback?.wrong || activeActivity.revisionGuidance;

  const updateActiveAnswers = (answers) => {
    setAnswersByActivity((current) => ({ ...current, [activeActivity.id]: answers }));
  };

  const submitActivity = () => {
    playSound("submit");
    setSubmittedActivityIds((current) => new Set([...current, activeActivity.id]));
    setCompletedActivityIds((current) => new Set([...current, activeActivity.id]));
    const isAllCorrect = activeScore.correct === activeScore.total;
    playSound(isAllCorrect ? "correct" : "wrong");
  };

  const tryAgain = () => {
    playSound("clickConfirm");
    setSubmittedActivityIds((current) => {
      const next = new Set(current);
      next.delete(activeActivity.id);
      return next;
    });
    setCompletedActivityIds((current) => {
      const next = new Set(current);
      next.delete(activeActivity.id);
      return next;
    });
    setAnswersByActivity((current) => {
      const next = { ...current };
      delete next[activeActivity.id];
      return next;
    });
  };

  const nextActivity = () => {
    playSound("nextActivity");
    if (activeIndex < activities.length - 1) {
      setActiveIndex((index) => index + 1);
      return;
    }

    setLessonComplete(true);
    if (!previewMode) {
      submitLesson?.({
        lesson_id: course.lesson.id,
        answers: answersByActivity,
      });
      onSubmission?.({
        student: "Demo Student",
        score: lessonScore.percent,
        status: "Submitted",
        attempt: "1/2",
        submittedAt: "Just now",
      });
    }
  };

  const restartLesson = () => {
    setActiveIndex(0);
    setAnswersByActivity({});
    setSubmittedActivityIds(new Set());
    setCompletedActivityIds(new Set());
    setLessonComplete(false);
  };

  if (lessonComplete) {
    return <LessonCompletionSummary score={lessonScore} lesson={course.lesson} onRestart={restartLesson} />;
  }

  return (
    <main className="activity-flow">
      <Card className="lesson-intro-panel activity-flow-header">
        <div>
          <span className="eyebrow"><BookOpen size={15} /> Digital book lesson</span>
          <h2>{course.lesson.title}</h2>
          <p>{course.title} / {course.lesson.unit}. Work through one focused activity at a time.</p>
        </div>
        <div className="lesson-meta-row">
          <Tag tone="gold">{course.lesson.estimatedTime}</Tag>
          <Tag tone="blue">{course.className}</Tag>
          <Tag tone="green">Auto feedback</Tag>
        </div>
      </Card>

      <ActivityProgress
        activities={activities}
        activeIndex={activeIndex}
        completedIds={completedActivityIds}
        onSelectActivity={(index) => {
          playSound("nextActivity");
          setActiveIndex(index);
        }}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={activeActivity.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <ActivityShell
            activity={activeActivity}
            index={activeIndex}
            submitted={activeSubmitted}
            resultSummary={activeScore}
          >
            <ActivityRenderer
              activity={activeActivity}
              answers={activeAnswers}
              onChange={updateActiveAnswers}
              submitted={activeSubmitted}
              resultMap={activeSubmitted ? resultMapFromResults(activeResults) : {}}
            />
          </ActivityShell>

          <Card className="single-activity-actions">
            {!activeSubmitted ? (
              <>
                <div>
                  <h2>Submit this activity</h2>
                  <p>Feedback appears after submission. The next activity stays locked until you continue.</p>
                </div>
                <button className="primary-action" data-sound-ignore="true" onClick={submitActivity}>
                  <Send size={17} /> Submit activity
                </button>
              </>
            ) : (
              <ActivityFeedback
                score={activeScore}
                guidance={activityGuidance}
                isFinal={activeIndex === activities.length - 1}
                onTryAgain={tryAgain}
                onNext={nextActivity}
              />
            )}
          </Card>
        </motion.div>
      </AnimatePresence>
    </main>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, CheckCircle2, Headphones, Maximize2, Pause, Play, RotateCcw, Timer, Volume2, VolumeX, X } from "lucide-react";
import unit2ListeningAudio from "../../../assets/books/ultimate-b2/media/unit_2_listening_page_20.mp3";
import unit2ReadingAudio from "../../../assets/books/ultimate-b2/media/unit_2_reading_on_a_fast_track.mp3";
import unit2ReadingVideo from "../../../assets/books/ultimate-b2/media/unit_2_reading_video.mp4";
import { findUltimateB2Exercise } from "../../../data/ultimateB2DemoData.js";
import { Card, SectionTitle, Tag } from "../Shared.jsx";
import { InlineBlankPrompt } from "./InlineBlankPrompt.jsx";
import {
  QUIZ_DURATION_SECONDS,
  grammarExercise4,
  grammarOpening,
  grammarRuleSections,
  listeningGapFillItems,
  quizQuestions,
  readingExercise3,
  readingExercise3Options,
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

function normalizeTypedAnswer(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ");
}

function isTypedAnswerCorrect(studentAnswer, item) {
  const normalizedStudentAnswer = normalizeTypedAnswer(studentAnswer).replace(/,/g, "");
  const acceptedAnswers = item.acceptedAnswers?.length ? item.acceptedAnswers : [item.answer];

  return acceptedAnswers.some((accepted) => {
    const normalizedAccepted = normalizeTypedAnswer(accepted);
    return normalizedStudentAnswer === normalizedAccepted || normalizedStudentAnswer === normalizedAccepted.replace(/,/g, "");
  });
}

function normalizeSentenceAnswer(value = "") {
  return normalizeTypedAnswer(value)
    .replace(/[.!?]+$/g, "")
    .replace(/\s*([,;:])\s*/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSentenceAnswerCorrect(studentAnswer, expectedAnswer) {
  return normalizeSentenceAnswer(studentAnswer) === normalizeSentenceAnswer(expectedAnswer);
}

function FeedbackRows({ rows }) {
  const correctCount = rows.filter((row) => row.correct).length;
  const score = rows.length ? Math.round((correctCount / rows.length) * 100) : 0;

  return (
    <>
      <div className="ultimate-result-summary">
        <strong>{score}%</strong>
        <span>{correctCount}/{rows.length} correct</span>
        <Tag tone={score >= 70 ? "green" : "gold"}>{score >= 70 ? "Submitted" : "Review needed"}</Tag>
      </div>
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
    </>
  );
}

function ChoiceSet({ questions, answers, setAnswers, disabled = false, submittedRows = null }) {
  const submittedById = Object.fromEntries((submittedRows || []).map((row) => [row.id, row]));

  return (
    <div className="ultimate-question-list">
      {questions.map((question, index) => {
        const prompt = question.question || question.prompt;
        const submitted = submittedById[question.id];
        const selectedAnswer = answers[question.id] || submitted?.studentAnswer || "";

        return (
          <fieldset key={question.id} className="ultimate-question-card" disabled={disabled}>
            <legend>
              <span>{index + 1}. </span>
              <InlineBlankPrompt
                prompt={prompt}
                selectedAnswer={selectedAnswer}
                submitted={Boolean(submitted)}
                isCorrect={Boolean(submitted?.correct)}
              />
            </legend>
            {Array.isArray(question.options) && question.options.length > 0 ? (
              question.options.map((option) => (
                <label key={option} className={answers[question.id] === option ? "selected" : ""}>
                  <input
                    type="radio"
                    name={question.id}
                    checked={answers[question.id] === option}
                    onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                  />
                  <span>{option}</span>
                </label>
              ))
            ) : (
              <label>
                <span className="sr-only">Answer</span>
                <input
                  type="text"
                  value={answers[question.id] || ""}
                  placeholder="Type your answer"
                  onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                />
              </label>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

function ReadingAudioTextPanel({
  gapAnswers = {},
  selectedGap,
  selectedOption,
  dragOverGap,
  onGapClick,
  onGapDrop,
  onGapDragOver,
  onGapDragLeave,
  onRemoveGap,
  submittedRows,
  disabled = false,
}) {
  const renderParts = (paragraph) => {
    const parts = paragraph.parts || [paragraph.text];
    return parts.map((part, index) => {
      if (typeof part === "string") return <span key={`${paragraph.id}-text-${index}`}>{part} </span>;

      const selectedAnswer = gapAnswers[part.gap];
      const selectedOptionData = readingExercise3Options.find((option) => option.id === selectedAnswer);
      const submitted = submittedRows?.find((row) => row.gap === part.gap);
      const correctOptionData = readingExercise3Options.find((option) => option.id === submitted?.answer);
      const stateClass = [
        submitted ? (submitted.correct ? "correct" : "wrong") : "",
        selectedGap === part.gap ? "selected" : "",
        selectedAnswer ? "filled" : "",
        dragOverGap === part.gap ? "drag-over" : "",
      ].filter(Boolean).join(" ");

      return (
        <button
          key={`${paragraph.id}-gap-${part.gap}`}
          type="button"
          className={`reading-gap-chip ${stateClass}`}
          onClick={() => onGapClick?.(part.gap)}
          onDragOver={(event) => {
            if (disabled || submittedRows) return;
            event.preventDefault();
            onGapDragOver?.(part.gap);
          }}
          onDragLeave={() => onGapDragLeave?.(part.gap)}
          onDrop={(event) => {
            if (disabled || submittedRows) return;
            event.preventDefault();
            onGapDrop?.(part.gap, event.dataTransfer.getData("text/plain"));
          }}
          aria-label={`Gap ${part.gap}`}
          aria-describedby={selectedOption ? "selected-reading-option" : undefined}
          data-sound-click="tab"
        >
          {selectedAnswer ? (
            <>
              <span className="reading-gap-badge">{selectedAnswer}</span>
              <span className="reading-gap-sentence">{selectedOptionData?.text || selectedAnswer}</span>
            </>
          ) : (
            <span className="reading-gap-placeholder">Drop sentence here</span>
          )}
          {selectedAnswer && !submittedRows && !disabled && (
            <em
              role="button"
              tabIndex={0}
              aria-label={`Clear gap ${part.gap}`}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveGap?.(part.gap);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemoveGap?.(part.gap);
                }
              }}
            >
              x
            </em>
          )}
          {submitted && !submitted.correct && (
            <small className="reading-gap-correction">
              Correct: {submitted.answer}. {correctOptionData?.text}
            </small>
          )}
        </button>
      );
    });
  };

  return (
    <Card className="reading-audio-text-panel">
      <div className="reading-text-heading">
        <span className="eyebrow"><BookOpen size={15} /> Students Book / Unit 2 Reading</span>
        <h2>On a fast track</h2>
      </div>
      <div className="reading-paragraph-stack">
        {readingText.map((paragraph, index) => (
          <p key={paragraph.id}>
            <b>{index + 1}</b>
            {renderParts(paragraph)}
          </p>
        ))}
      </div>
    </Card>
  );
}

function ReadingAudioPlayer() {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      return;
    }
    audio.pause();
  };

  const replay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
    audio.play();
  };

  const seek = (nextTime) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const clampedTime = Math.min(Math.max(nextTime, 0), duration);
    audio.currentTime = clampedTime;
    setCurrentTime(clampedTime);
  };

  return (
    <div className="reading-audio-player">
      <audio
        ref={audioRef}
        className="sr-only"
        preload="metadata"
        src={unit2ReadingAudio}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => {
          const nextTime = event.currentTarget.currentTime || 0;
          setCurrentTime(nextTime);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={(event) => {
          setPlaying(false);
          setCurrentTime(event.currentTarget.duration || duration);
        }}
      >
        <track kind="captions" />
      </audio>
      <div>
        <span className="eyebrow">Audio reading</span>
        <strong>On a fast track</strong>
        <small>Listen to the text before placing the missing sentences.</small>
      </div>
      <button type="button" className="thames-play-button" onClick={togglePlayback} aria-label={playing ? "Pause reading audio" : "Play reading audio"} data-sound-click="tab">
        {playing ? <Pause size={20} /> : <Play size={20} />}
      </button>
      <div className="custom-audio-progress-row">
        <span className="custom-audio-time">{formatMediaTime(currentTime)}</span>
        <CustomAudioProgress currentTime={currentTime} duration={duration} onSeek={seek} ariaLabel="Reading audio progress" />
        <span className="custom-audio-time">{formatMediaTime(duration)}</span>
      </div>
      <button type="button" className="thames-replay-button" onClick={replay} aria-label="Replay reading audio" data-sound-click="tab">
        <RotateCcw size={17} />
      </button>
    </div>
  );
}

function ReadingContextPanel({
  gapAnswers,
  selectedGap,
  selectedOption,
  dragOverGap,
  onGapClick,
  onGapDrop,
  onGapDragOver,
  onGapDragLeave,
  onRemoveGap,
  submittedRows,
  disabled = false,
}) {
  return (
    <div className="reading-context-panel">
      <ReadingAudioTextPanel
        gapAnswers={gapAnswers}
        selectedGap={selectedGap}
        selectedOption={selectedOption}
        dragOverGap={dragOverGap}
        onGapClick={onGapClick}
        onGapDrop={onGapDrop}
        onGapDragOver={onGapDragOver}
        onGapDragLeave={onGapDragLeave}
        onRemoveGap={onRemoveGap}
        submittedRows={submittedRows}
        disabled={disabled}
      />
    </div>
  );
}

function MissingSentenceExercise({ mode, onSubmit }) {
  const [selectedGap, setSelectedGap] = useState(1);
  const [selectedOption, setSelectedOption] = useState("");
  const [draggingOption, setDraggingOption] = useState("");
  const [dragOverGap, setDragOverGap] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(null);
  const isLocked = mode === "teacher-preview" || Boolean(submittedRows);

  const submit = () => {
    const rows = readingExercise3.map((item) => {
      const studentAnswer = answers[item.gap] || "";
      return {
        ...item,
        studentAnswer,
        correct: studentAnswer === item.answer,
      };
    });
    setSubmittedRows(rows);
    onSubmit?.({ activityKey: "reading-ex3", score: Math.round((rows.filter((row) => row.correct).length / rows.length) * 100) });
  };

  const placeOption = (optionId, targetGap = selectedGap) => {
    if (isLocked || !optionId || !targetGap) return;
    setAnswers((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([, value]) => value !== optionId));
      next[targetGap] = optionId;
      return next;
    });
    setSelectedOption("");
    setSelectedGap((current) => (current === targetGap ? Math.min(targetGap + 1, 6) : current));
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

  const unusedOptions = readingExercise3Options.filter((option) => !Object.values(answers).includes(option.id));
  const displayedOptions = submittedRows ? readingExercise3Options : unusedOptions;
  const extraOption = readingExercise3Options.find((option) => option.id === "D");

  return (
    <div className="reading-ex3-shell">
      {/* TODO: add synced reading highlights in a later phase. */}
      <ReadingAudioPlayer />
      <Card className="reading-ex3-header">
        <span className="eyebrow">Students Book / Unit 2 Reading</span>
        <h2>Exercise 3</h2>
        <p>Read the text again and insert the missing sentences. There is one extra sentence which you do not need to use.</p>
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
              const studentOption = readingExercise3Options.find((option) => option.id === row.studentAnswer);
              const correctOption = readingExercise3Options.find((option) => option.id === row.answer);
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
        </Card>
      )}
    </div>
  );
}

function CircleWordsExercise({ mode, onSubmit }) {
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
                    {selectedAnswer || "choose"}
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

function VideoIntro({ mode, onSubmit, onNextActivity }) {
  const [watched, setWatched] = useState(false);
  const completeVideo = () => {
    if (!watched) {
      setWatched(true);
      onSubmit?.({ activityKey: "video-intro", score: 100 });
      return;
    }
    onNextActivity?.("reading-ex3");
  };

  return (
    <Card className="ultimate-media-card">
      <div className="ultimate-media-heading">
        <span className="eyebrow"><Play size={15} /> Watch before reading</span>
        <Tag tone={watched ? "green" : "gold"}>{watched ? "Ready for reading" : "Required intro"}</Tag>
      </div>
      <CustomVideoPlayer mode={mode} onWatched={() => setWatched(true)} />
      <p>This short introduction prepares students for the Unit 2 reading topic and key ideas.</p>
      {mode === "student" && (
        <button className="primary-action" type="button" onClick={completeVideo} data-sound-click="submit">
          {watched ? "Start Exercise 3" : "Continue to Reading Text"}
        </button>
      )}
      {watched && <div className="inline-status success">Video watched.</div>}
    </Card>
  );
}

function ReadingExercise({ activityKey, mode, onSubmit }) {
  if (activityKey === "reading-ex4") return <CircleWordsExercise mode={mode} onSubmit={onSubmit} />;
  return <MissingSentenceExercise mode={mode} onSubmit={onSubmit} />;
}

function formatMediaTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

function CustomAudioProgress({ currentTime, duration, onSeek, ariaLabel = "Audio progress" }) {
  const trackRef = useRef(null);
  const progressPercent = duration ? Math.min(Math.max((currentTime / duration) * 100, 0), 100) : 0;

  const seekFromClientX = (clientX) => {
    const track = trackRef.current;
    if (!track || !duration) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    onSeek?.(ratio * duration);
  };

  const handlePointerDown = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekFromClientX(event.clientX);
  };

  const handlePointerMove = (event) => {
    if (event.buttons !== 1) return;
    seekFromClientX(event.clientX);
  };

  const handleKeyDown = (event) => {
    if (!duration) return;
    const step = event.shiftKey ? 15 : 5;
    let nextTime = currentTime;

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") nextTime = currentTime - step;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") nextTime = currentTime + step;
    else if (event.key === "Home") nextTime = 0;
    else if (event.key === "End") nextTime = duration;
    else return;

    event.preventDefault();
    onSeek?.(Math.min(Math.max(nextTime, 0), duration));
  };

  return (
    <div
      ref={trackRef}
      className="custom-audio-track"
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration || 0)}
      aria-valuenow={Math.round(currentTime || 0)}
      aria-valuetext={`${formatMediaTime(currentTime)} of ${formatMediaTime(duration)}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
    >
      <span className="custom-audio-track-fill" style={{ width: `${progressPercent}%` }} />
      <span className="custom-audio-thumb" style={{ left: `${progressPercent}%` }} />
    </div>
  );
}

function CustomVideoPlayer({ title = "Unit 2 Video Intro", subtitle = "Prepare for the Unit 2 reading text", durationLabel = "02:15", mode = "student", onWatched }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const [ended, setEnded] = useState(false);
  const progress = duration ? (currentTime / duration) * 100 : 0;

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      return;
    }
    video.pause();
  };

  const seek = (event) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = (Number(event.target.value) / 100) * duration;
  };

  const replay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    setEnded(false);
    video.play();
  };

  const changeVolume = (event) => {
    const nextVolume = Number(event.target.value);
    const video = videoRef.current;
    setVolume(nextVolume);
    setMuted(nextVolume === 0);
    if (video) {
      video.volume = nextVolume;
      video.muted = nextVolume === 0;
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (video) video.muted = nextMuted;
  };

  const openFullscreen = () => {
    const video = videoRef.current;
    if (video?.requestFullscreen) video.requestFullscreen();
  };

  const markEnded = () => {
    setEnded(true);
    setPlaying(false);
    onWatched?.();
  };

  return (
    <div className={`custom-video-shell ${playing ? "is-playing" : ""} ${ended ? "is-ended" : ""}`}>
      <div className="custom-video-stage" onClick={togglePlayback} role="presentation">
        {!metadataLoaded && <div className="custom-video-loading">Loading video...</div>}
        <video
          ref={videoRef}
          preload="metadata"
          src={unit2ReadingVideo}
          playsInline
          onLoadedMetadata={(event) => {
            setMetadataLoaded(true);
            setDuration(event.currentTarget.duration || 0);
            event.currentTarget.volume = volume;
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
          onPlay={() => { setPlaying(true); setEnded(false); }}
          onPause={() => setPlaying(false)}
          onEnded={markEnded}
        >
          <track kind="captions" />
        </video>
        <button type="button" className="custom-video-center-play" onClick={(event) => { event.stopPropagation(); togglePlayback(); }} aria-label={playing ? "Pause video" : "Play video"} data-sound-click="tab">
          {playing ? <Pause size={30} /> : <Play size={32} />}
        </button>
        <div className="custom-video-controls" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="custom-video-icon-button" onClick={togglePlayback} aria-label={playing ? "Pause video" : "Play video"} data-sound-click="tab">
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <span>{formatMediaTime(currentTime)} / {formatMediaTime(duration)}</span>
          <input
            className="custom-video-progress"
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={seek}
            aria-label="Video progress"
            style={{ "--video-progress": `${progress}%` }}
          />
          <button type="button" className="custom-video-icon-button" onClick={replay} aria-label="Replay video" data-sound-click="tab"><RotateCcw size={17} /></button>
          <button type="button" className="custom-video-icon-button" onClick={toggleMute} aria-label={muted ? "Unmute video" : "Mute video"} data-sound-click="tab">
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input className="custom-video-volume" type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={changeVolume} aria-label="Video volume" />
          <button type="button" className="custom-video-icon-button" onClick={openFullscreen} aria-label="Fullscreen video" data-sound-click="tab"><Maximize2 size={17} /></button>
        </div>
      </div>
      <div className="custom-video-meta">
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
          {mode === "teacher-preview" && <small>Teacher preview only</small>}
        </div>
        <Tag tone={ended ? "green" : "gold"}>{ended ? "Video watched" : durationLabel}</Tag>
      </div>
    </div>
  );
}

function ThamesAudioPlayer({ onPlayed }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play();
      onPlayed?.();
      return;
    }
    audio.pause();
  };

  const replay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = 0;
    setCurrentTime(0);
    audio.play();
    onPlayed?.();
  };

  const seek = (nextTime) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const clampedTime = Math.min(Math.max(nextTime, 0), duration);
    audio.currentTime = clampedTime;
    setCurrentTime(clampedTime);
  };

  return (
    <div className="thames-audio-player">
      <audio
        ref={audioRef}
        className="sr-only"
        preload="metadata"
        src={unit2ListeningAudio}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
        onPlay={() => { setPlaying(true); onPlayed?.(); }}
        onPause={() => setPlaying(false)}
        onEnded={(event) => {
          setPlaying(false);
          setCurrentTime(event.currentTarget.duration || duration);
        }}
      >
        <track kind="captions" />
      </audio>
      <div className="thames-audio-art">
        <Headphones size={34} />
      </div>
      <div className="thames-audio-main">
        <span>Listen and complete the sentences</span>
        <strong>A Thames River cruise</strong>
        <small>Workbook Unit 2 Listening, page 20</small>
        <div className="thames-audio-controls">
          <button type="button" className="thames-play-button" onClick={togglePlayback} aria-label={playing ? "Pause audio" : "Play audio"} data-sound-click="tab">
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <div className="custom-audio-progress-row">
            <span className="custom-audio-time">{formatMediaTime(currentTime)}</span>
            <CustomAudioProgress currentTime={currentTime} duration={duration} onSeek={seek} ariaLabel="Audio progress" />
            <span className="custom-audio-time">{formatMediaTime(duration)}</span>
          </div>
          <button type="button" className="thames-replay-button" onClick={replay} aria-label="Replay audio" data-sound-click="tab">
            <RotateCcw size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ListeningGapFillExercise({ mode, onSubmit, activity, questions = listeningGapFillItems }) {
  const [played, setPlayed] = useState(false);
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(null);
  const instruction = activity?.instructions || "Listen to a man giving a guided tour of the River Thames in London and complete the sentences with a word or short phrase.";

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
    onSubmit?.({ activityKey: "listening-page-20", score: Math.round((rows.filter((row) => row.correct).length / rows.length) * 100) });
  };

  return (
    <Card className="ultimate-listening-gap-card">
      <div className="card-heading">
        <div>
          <span className="eyebrow"><Headphones size={15} /> Ultimate B2 Workbook</span>
          <h2>A Thames River cruise</h2>
          <p>{instruction}</p>
        </div>
        <Tag tone="blue">Typed gap-fill</Tag>
      </div>
      <ThamesAudioPlayer onPlayed={() => setPlayed(true)} />
      {played && <div className="inline-status success">Audio sample marked as played.</div>}
      <div className="ultimate-gap-fill-list">
        {questions.map((item, index) => {
          const submitted = submittedRows?.find((row) => row.id === item.id);
          const answerLength = answers[item.id]?.length || item.answer?.length || 8;
          const inputChars = Math.min(Math.max(answerLength + 2, 9), 30);
          return (
            <label key={item.id} className={`ultimate-gap-fill-row ${submitted ? (submitted.correct ? "correct" : "wrong") : ""}`}>
              <span>{index + 1}</span>
              <span className="ultimate-inline-sentence">
                {item.before || item.prompt?.split("___")[0]}
                {" "}
                <input
                  aria-label={`Answer ${index + 1}`}
                  value={answers[item.id] || ""}
                  disabled={Boolean(submittedRows) || mode === "teacher-preview"}
                  maxLength={30}
                  className="listening-inline-input"
                  style={{ "--input-width": `${inputChars}ch` }}
                  onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value }))}
                />
                {" "}
                {item.after || item.prompt?.split("___")[1]}
              </span>
              {submitted && (
                <small>
                  Student answer: {submitted.studentAnswer || "No answer"} / Correct answer: {submitted.answer}
                </small>
              )}
            </label>
          );
        })}
      </div>
      {mode === "student" && !submittedRows && <button className="primary-action" type="button" onClick={submit} data-sound-click="submit">Submit listening</button>}
      {submittedRows && <FeedbackRows rows={submittedRows} />}
    </Card>
  );
}

function ListeningExercise({ mode, onSubmit }) {
  return <ListeningGapFillExercise mode={mode} onSubmit={onSubmit} />;
}

function GrammarRulesPopup({ onClose }) {
  const [activeRuleId, setActiveRuleId] = useState(grammarRuleSections[0].id);
  const activeRule = grammarRuleSections.find((rule) => rule.id === activeRuleId) || grammarRuleSections[0];

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="grammar-rules-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Card className="grammar-rules-modal" role="dialog" aria-modal="true" aria-labelledby="grammar-rules-title" onClick={(event) => event.stopPropagation()}>
        <button className="grammar-rules-close" type="button" onClick={onClose} aria-label="Close grammar rules"><X size={18} /></button>
        <div className="grammar-rules-head">
          <span className="eyebrow">Grammar support</span>
          <h2 id="grammar-rules-title">Unit 2 Grammar Rules</h2>
          <p>Review the forms and uses before completing the Unit 2 grammar exercises.</p>
        </div>
        <div className="grammar-rule-tabs" role="tablist" aria-label="Grammar rule sections">
          {grammarRuleSections.map((rule) => (
            <button
              key={rule.id}
              type="button"
              role="tab"
              aria-selected={rule.id === activeRuleId}
              className={rule.id === activeRuleId ? "active" : ""}
              onClick={(event) => {
                event.stopPropagation();
                setActiveRuleId(rule.id);
              }}
              data-sound-click="tab"
            >
              {rule.title}
            </button>
          ))}
        </div>
        <div key={activeRule.id} className="grammar-rule-content grammar-tab-panel">
          <section className="grammar-rule-card form-card">
            <h3>Form</h3>
            {activeRule.form.map((line) => <p key={line}>{line}</p>)}
          </section>
          <section className="grammar-rule-card">
            <h3>Use</h3>
            <ul>{activeRule.use.map((line) => <li key={line}>{line}</li>)}</ul>
          </section>
          <section className="grammar-rule-card">
            <h3>Examples</h3>
            <ul>{activeRule.examples.map((line) => <li key={line}>{line}</li>)}</ul>
          </section>
          {activeRule.timeExpressions && (
            <section className="grammar-rule-card grammar-time-expressions">
              <h3>Time expressions</h3>
              <p>{activeRule.timeExpressions}</p>
            </section>
          )}
          {activeRule.notes && (
            <section className="grammar-rule-card grammar-extra-notes">
              <h3>Extra notes</h3>
              <ul>{activeRule.notes.map((line) => <li key={line}>{line}</li>)}</ul>
            </section>
          )}
        </div>
      </Card>
    </div>
  );
}

function GrammarSentenceJoiningExercise({ mode, onSubmit, onOpenRules }) {
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
        <button className="secondary-action" type="button" onClick={onOpenRules} data-sound-click="tab">View grammar rules</button>
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
      {mode === "student" && !submittedRows && <button className="primary-action" type="button" onClick={submit} data-sound-click="submit">Submit sentences</button>}
      {submittedRows && <FeedbackRows rows={submittedRows} />}
    </>
  );
}

function GrammarExercise({ activityKey, mode, onSubmit }) {
  const [rulesOpen, setRulesOpen] = useState(false);
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
      {activityKey === "grammar-ex4" ? (
        <GrammarSentenceJoiningExercise mode={mode} onSubmit={onSubmit} onOpenRules={() => setRulesOpen(true)} />
      ) : (
        <>
          <div className="card-heading">
            <div>
              <span className="eyebrow">Ultimate B2 Grammar Book</span>
              <h2>Opening exercise</h2>
              <p>Complete the Unit 2 grammar warm-up. Use the rules popup as your support tool before answering.</p>
            </div>
            <button className="secondary-action" type="button" onClick={() => setRulesOpen(true)} data-sound-click="tab">View grammar rules</button>
          </div>
          <ChoiceSet
            questions={questions}
            answers={answers}
            setAnswers={setAnswers}
            disabled={Boolean(submittedRows) || mode === "teacher-preview"}
            submittedRows={submittedRows}
          />
          {mode === "student" && !submittedRows && <button className="primary-action" type="button" onClick={submit} data-sound-click="submit">Submit grammar</button>}
          {submittedRows && <FeedbackRows rows={submittedRows} />}
        </>
      )}
      {rulesOpen && <GrammarRulesPopup onClose={() => setRulesOpen(false)} />}
    </Card>
  );
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

const QUIZ_2_COMPLETED_STORAGE_KEY = "hh_lms_quiz_2_attempt_completed";

function TimedQuiz({ mode, onSubmit }) {
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(() => {
    if (mode !== "student" || typeof window === "undefined") return null;
    try {
      const storedAttempt = window.localStorage.getItem(QUIZ_2_COMPLETED_STORAGE_KEY);
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
    const rows = scoreAnswers(quizQuestions, answers);
    setSubmittedRows(rows);
    if (options.autoSubmit) setTimeExpired(true);
    if (mode === "student") {
      try {
        // TODO: Clear hh_lms_quiz_2_attempt_completed in dev tools to reset this demo-only one-attempt guard.
        window.localStorage.setItem(QUIZ_2_COMPLETED_STORAGE_KEY, JSON.stringify({ completed: true, rows }));
      } catch {
        // Demo persistence is best-effort; submittedRows still enforces this attempt for the current session.
      }
    }
    onSubmit?.({ activityKey: "quiz-2", score: Math.round((rows.filter((row) => row.correct).length / rows.length) * 100) });
  }, [answers, mode, onSubmit, submittedRows]);

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

  if (!hasCompletedAttempt && !testStarted) {
    return (
      <Card>
        <div className="ultimate-quiz-start-card">
          <div className="ultimate-quiz-start-copy">
            <span className="eyebrow"><Timer size={15} /> {mode === "teacher-preview" ? "Teacher preview" : "Ultimate B2 Test Book"}</span>
            <h2>Quiz 2</h2>
            <p>Timed test, 20 minutes</p>
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
              "Answer all 40 multiple choice questions.",
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
    <Card>
      <div className={`ultimate-quiz-head ${submittedRows ? "submitted" : ""} ${timerTone}`}>
        <div>
          <span className="eyebrow"><Timer size={15} /> Ultimate B2 Test Book</span>
          <h2>Quiz 2</h2>
          <p>{submittedRows ? "This test has already been submitted." : "Choose the correct answer. Submit when ready or when time is up."}</p>
        </div>
        <div className="ultimate-quiz-status-actions">
          <strong className={remaining === 0 ? "time-up" : ""}>{submittedRows ? "Submitted" : formatTime(remaining)}</strong>
          <span>Answered {displayedAnsweredCount}/{quizQuestions.length}</span>
          {mode === "student" && !submittedRows && (
            <button className="secondary-action" type="button" onClick={() => submit()} data-sound-click="submit">Submit test</button>
          )}
        </div>
      </div>
      {timeExpired && <div className="inline-status warning">Time is up. The test has been submitted.</div>}
      {hasCompletedAttempt && <div className="inline-status success">This test has already been submitted.</div>}
      <div className="ultimate-quiz-progress-row">
        <Tag tone="blue">Question {Math.min(displayedAnsweredCount + 1, quizQuestions.length)} of {quizQuestions.length}</Tag>
        <Tag tone="gold">Answered {displayedAnsweredCount}/{quizQuestions.length}</Tag>
      </div>
      <ChoiceSet
        questions={quizQuestions}
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
  );
}

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

function DatabaseActivity({ activity, mode, onSubmit, onNextActivity }) {
  const [answers, setAnswers] = useState({});
  const [submittedRows, setSubmittedRows] = useState(null);
  const [watched, setWatched] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const activityType = activity.activityType || activity.activity_type;
  const contentJson = activity.contentJson || activity.content_json || {};
  const questions = dbQuestionsToChoiceQuestions(activity.questions || []);
  const gapFillQuestions = dbQuestionsToGapFillItems(activity.questions || []);
  const demoActivityKey = activity.demoActivityKey || contentJson.demoActivityKey || activity.slug;

  const submit = () => {
    const rows = scoreAnswers(questions, answers);
    setSubmittedRows(rows);
    onSubmit?.({
      activityKey: activity.demoActivityKey || contentJson.demoActivityKey || activity.slug || activity.id,
      activityId: activity.id,
      score: Math.round((rows.filter((row) => row.correct).length / Math.max(rows.length, 1)) * 100),
    });
  };

  if (activityType === "media_video") {
    const completeVideo = () => {
      if (!watched) {
        setWatched(true);
        onSubmit?.({ activityKey: activity.demoActivityKey || activity.slug, activityId: activity.id, score: 100 });
        return;
      }
      onNextActivity?.("reading-ex3");
    };

    return (
      <Card className="ultimate-media-card">
        <div className="ultimate-media-heading">
          <span className="eyebrow"><Play size={15} /> Watch before reading</span>
          <Tag tone={watched ? "green" : "gold"}>{watched ? "Ready for reading" : "Required intro"}</Tag>
        </div>
        <CustomVideoPlayer
          title={activity.title}
          subtitle="Prepare for the Unit 2 reading text"
          durationLabel={contentJson.duration || "02:15"}
          mode={mode}
          onWatched={() => setWatched(true)}
        />
        <p>{activity.instructions || "Watch the video introduction before starting the exercises."}</p>
        {mode === "student" && (
          <button className="primary-action" type="button" onClick={completeVideo} data-sound-click="submit">
            {watched ? "Start Exercise 3" : "Continue to Reading Text"}
          </button>
        )}
        {watched && <div className="inline-status success">Video watched.</div>}
      </Card>
    );
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
        <GrammarSentenceJoiningExercise mode={mode} onSubmit={onSubmit} onOpenRules={() => setRulesOpen(true)} />
        {rulesOpen && <GrammarRulesPopup onClose={() => setRulesOpen(false)} />}
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
        {(contentJson.grammar_rules || contentJson.grammarRules) && (
          <button className="secondary-action" type="button" onClick={() => setRulesOpen(true)} data-sound-click="tab">View grammar rules</button>
        )}
      </div>
      {activityType === "listening_multiple_choice" && (
        <div className="ultimate-audio-placeholder">
          <Headphones size={28} />
          <div>
            <strong>Unit 2 listening audio</strong>
            <span>{contentJson.duration || "01:40"} / Ultimate B2 local demo audio asset</span>
          </div>
          <audio controls preload="metadata" src={unit2ListeningAudio} />
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
      {mode === "student" && !submittedRows && <button className="primary-action" type="button" onClick={submit} data-sound-click="submit">Submit answers</button>}
      {submittedRows && <FeedbackRows rows={submittedRows} />}
      {rulesOpen && <GrammarRulesPopup onClose={() => setRulesOpen(false)} />}
    </Card>
  );
}

function ActivityBody({ activityKey, activity, mode, onSubmit, onNextActivity }) {
  if (activityKey === "video-intro") return <VideoIntro mode={mode} onSubmit={onSubmit} onNextActivity={onNextActivity} />;
  if (activityKey === "reading-ex3" || activityKey === "reading-ex4") return <ReadingExercise activityKey={activityKey} mode={mode} onSubmit={onSubmit} />;
  if (activityKey === "listening-page-20") return <ListeningExercise mode={mode} onSubmit={onSubmit} />;
  if (activityKey === "grammar-opening" || activityKey === "grammar-ex4") return <GrammarExercise activityKey={activityKey} mode={mode} onSubmit={onSubmit} />;
  if (activityKey === "quiz-2") return <TimedQuiz mode={mode} onSubmit={onSubmit} />;
  if (activity?.questions?.length || activity?.activityType === "media_video" || activity?.activity_type === "media_video") {
    return <DatabaseActivity activity={activity} mode={mode} onSubmit={onSubmit} onNextActivity={onNextActivity} />;
  }
  return <Card><h2>Demo activity not configured</h2><p>This activity key is ready for future content mapping.</p></Card>;
}

export function UltimateB2ActivityRunner({ activityKey, exerciseId, activity, mode = "student", onBack, onSubmit, onNextActivity }) {
  const resolved = findUltimateB2Exercise(activityKey || exerciseId);
  const exercise = resolved?.exercise;
  const contentJson = activity?.contentJson || activity?.content_json || {};
  const key = exercise?.demoActivityKey || activity?.demoActivityKey || contentJson.demoActivityKey || activityKey || exerciseId;
  const title = activity?.title || exercise?.title || "Ultimate B2 activity";

  return (
    <div className="ultimate-activity-runner">
      <button className="secondary-action compact-action" type="button" onClick={onBack} data-sound-click="back">Back</button>
      <SectionTitle
        eyebrow={mode === "teacher-preview" ? "Teacher preview" : "Demo activity"}
        title={title}
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
      <ActivityBody activityKey={key} activity={activity} mode={mode} onSubmit={onSubmit} onNextActivity={onNextActivity} />
    </div>
  );
}

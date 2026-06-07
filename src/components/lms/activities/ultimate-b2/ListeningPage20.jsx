import { useRef, useState } from "react";
import { Headphones, Pause, Play, RotateCcw } from "lucide-react";
import unit2ListeningAudio from "../../../../assets/books/ultimate-b2/media/unit_2_listening_page_20.mp3";
import { Card, Tag } from "../../Shared.jsx";
import { listeningGapFillItems } from "../ultimateB2ActivityContent.js";
import { FeedbackRows } from "./shared/FeedbackRows.jsx";
import { CustomAudioProgress } from "./shared/CustomAudioProgress.jsx";
import { formatMediaTime } from "./shared/MediaTime.js";
import { isTypedAnswerCorrect } from "./shared/typedAnswerUtils.js";

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

export function ListeningGapFillExercise({ mode, onSubmit, activity, questions = listeningGapFillItems }) {
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

export function ListeningPage20({ mode, onSubmit }) {
  return <ListeningGapFillExercise mode={mode} onSubmit={onSubmit} />;
}

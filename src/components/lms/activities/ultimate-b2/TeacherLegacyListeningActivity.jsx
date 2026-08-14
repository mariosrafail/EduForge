import { Headphones, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import listeningAuthoring from "virtual:ultimate-b2-listening-authoring";
import { ultimateB2Unit1Part2LegacyAudio } from "virtual:ultimate-b2-unit1-part2-legacy-pilot-audio";
import { ultimateB2StudentsBookMedia } from "virtual:ultimate-b2-media-assets";
import { useBookAsset } from "../../../../hooks/useBookAsset.js";
import { useTeacherListeningPlayerAssets } from "virtual:teacher-listening-player-assets";
import { useExclusiveMediaPlayback } from "./shared/useExclusiveMediaPlayback.js";
import { findListeningCue, findListeningScrollEntry, formatListeningTime } from "./listeningRuntime.js";
import "./teacherLegacyListeningActivity.css";

const VIEW_QUESTIONS = "questions";
const VIEW_STATIC = "static-text";
const VIEW_KARAOKE = "karaoke";

function useResolvedListeningAsset(configuredAsset) {
  return useBookAsset(configuredAsset?.logicalKey || null, {
    devFallbackUrl: configuredAsset?.devFallbackUrl || configuredAsset?.localUrl || null,
  });
}

function PlayerButton({ label, source, pressedSource, disabled = false, onClick }) {
  return (
    <button type="button" className="teacher-listening-player-button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <img className="normal" src={source} alt="" draggable="false" />
      <img className="pressed" src={pressedSource} alt="" draggable="false" />
    </button>
  );
}

function TeacherListeningAudioPlayer({ currentMs, durationMs, playing, muted, onPlay, onPause, onStop, onSeek, onToggleMute }) {
  const player = useTeacherListeningPlayerAssets();
  const maximum = Math.max(durationMs, listeningAuthoring.karaoke.cues.at(-1).endMs);
  return (
    <div className="teacher-listening-audio-player" aria-label="Full reading audio player">
      <img className="teacher-listening-player-background" src={player.background} alt="" draggable="false" />
      <input
        className="teacher-listening-player-seek"
        type="range"
        min="0"
        max={maximum}
        step="1"
        value={Math.min(currentMs, maximum)}
        aria-label="Reading position"
        onChange={(event) => onSeek(Number(event.target.value))}
      />
      <div className="teacher-listening-player-controls">
        <PlayerButton label="Play full reading" source={player.play.active} pressedSource={player.play.pressed} onClick={onPlay} />
        <PlayerButton label="Pause full reading" source={player.pause.active} pressedSource={player.pause.pressed} disabled={!playing} onClick={onPause} />
        <PlayerButton label="Stop full reading" source={player.stop.active} pressedSource={player.stop.pressed} disabled={!currentMs && !playing} onClick={onStop} />
        <button type="button" className="teacher-listening-mute" aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} onClick={onToggleMute}>
          {muted ? <VolumeX /> : <Volume2 />}
        </button>
      </div>
      <output className="teacher-listening-player-time">{formatListeningTime(currentMs)} / {formatListeningTime(maximum)}</output>
    </div>
  );
}

function TeacherListeningQuestions({ activity, images, error, questionProps, onPlaySegment, player }) {
  return (
    <section className="teacher-listening-questions" aria-label="Listening questions">
      <img className="teacher-listening-instruction" src={images.instruction} alt="Exercise 2. Listen and read the text. Then answer the questions." draggable="false" />
      {listeningAuthoring.questionSegments.map((segment, index) => {
        const question = activity.runtime.questions.find((item) => item.id === segment.questionId);
        const revealed = questionProps.revealedQuestionIds.includes(segment.questionId);
        const modelAnswer = questionProps.solutions?.questions?.[segment.questionId]?.acceptedAnswers?.[0] || "";
        return (
          <article className={`teacher-listening-question question-${index + 1}`} key={segment.id}>
            <button type="button" className="teacher-listening-segment-button" onClick={() => onPlaySegment(index)} aria-label={`Play passage for question ${index + 1}`} title={`Play passage ${index + 1}`}>
              <Headphones aria-hidden="true" />
            </button>
            <h3><span>{index + 1}</span>{question?.prompt || segment.questionText}</h3>
            <button
              type="button"
              className={`teacher-listening-answer-lines ${revealed ? "revealed" : ""}`}
              style={{ "--answer-lines": segment.answerLineCount }}
              aria-label={revealed ? `Model answer ${index + 1}` : `Reveal model answer ${index + 1}`}
              aria-pressed={revealed}
              onClick={() => questionProps.revealQuestion(segment.questionId)}
              disabled={!questionProps.capabilities.canRevealSolutions || questionProps.solutionsLoading}
            >
              {revealed && modelAnswer ? <span>{modelAnswer}</span> : <span className="sr-only">Reveal answer</span>}
            </button>
          </article>
        );
      })}
      {error && <p className="teacher-listening-error" role="alert">{error}</p>}
      <div className="teacher-listening-question-player">{player}</div>
    </section>
  );
}

function TeacherListeningStaticText({ images, activeSegment, viewportRef }) {
  const segment = activeSegment === null ? null : listeningAuthoring.questionSegments[activeSegment];
  const surface = listeningAuthoring.staticText.surface;
  return (
    <section className="teacher-listening-text-viewport" ref={viewportRef} aria-label="Static reading text" tabIndex="0">
      <div className="teacher-listening-static-canvas" style={{ width: surface.width, height: surface.height }}>
        <img src={images.readingText} alt="The Netflix Effect reading text" draggable="false" />
        {segment?.regions.map((region) => (
          <span
            key={region.id}
            className="teacher-listening-static-highlight"
            style={{ left: region.x, top: region.y, width: region.width, height: region.height }}
            aria-hidden="true"
          />
        ))}
      </div>
    </section>
  );
}

function FragmentRuns({ runs }) {
  return runs.map((run, index) => run.style === "italic"
    ? <i key={index}>{run.text}</i>
    : run.style === "bold"
      ? <b key={index}>{run.text}</b>
      : <span key={index}>{run.text}</span>);
}

function TeacherListeningKaraoke({ images, activeCue, viewportRef, player }) {
  const activeFragmentIds = useMemo(() => new Set(activeCue?.fragmentIds || []), [activeCue]);
  const { content, background, fragments } = listeningAuthoring.karaoke;
  return (
    <section className="teacher-listening-karaoke-shell" aria-label="Synchronized reading text">
      <div className="teacher-listening-text-viewport teacher-listening-karaoke-viewport" ref={viewportRef} tabIndex="0">
        <div className="teacher-listening-karaoke-canvas" style={{ width: content.width, height: content.height }}>
          <img className="teacher-listening-karaoke-background" src={images.background} alt="" aria-hidden="true" draggable="false" style={{ left: background.x, top: background.y, width: background.width, height: background.height }} />
          {fragments.map((fragment) => (
            <span
              key={fragment.id}
              className={`teacher-listening-fragment ${activeFragmentIds.has(fragment.id) ? "active" : ""}`}
              data-listening-fragment-id={fragment.id}
              style={{ left: fragment.x, top: fragment.y, width: fragment.width, height: fragment.height }}
            ><FragmentRuns runs={fragment.runs} /></span>
          ))}
        </div>
      </div>
      <div className="teacher-listening-karaoke-player">{player}</div>
    </section>
  );
}

export function TeacherLegacyListeningActivity({ activity, images, questionProps, showTextCommand = 0, onStateChange }) {
  const [view, setView] = useState(VIEW_QUESTIONS);
  const [activeSegment, setActiveSegment] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const fullAudioRef = useRef(null);
  const segmentAudioRef = useRef(null);
  const viewportRef = useRef(null);
  const animationRef = useRef(0);
  const initialCommand = useRef(showTextCommand);
  const announceFullPlayback = useExclusiveMediaPlayback(fullAudioRef);
  const announceSegmentPlayback = useExclusiveMediaPlayback(segmentAudioRef);
  const fullConfigured = ultimateB2StudentsBookMedia[listeningAuthoring.assets.fullAudio] || {};
  const fullAsset = useResolvedListeningAsset(fullConfigured);
  const segmentOne = useResolvedListeningAsset(ultimateB2Unit1Part2LegacyAudio[listeningAuthoring.questionSegments[0].audioLogicalKey]);
  const segmentTwo = useResolvedListeningAsset(ultimateB2Unit1Part2LegacyAudio[listeningAuthoring.questionSegments[1].audioLogicalKey]);
  const segmentThree = useResolvedListeningAsset(ultimateB2Unit1Part2LegacyAudio[listeningAuthoring.questionSegments[2].audioLogicalKey]);
  const segmentAssets = [segmentOne, segmentTwo, segmentThree];

  const stopSegment = () => {
    const audio = segmentAudioRef.current;
    if (audio) {
      audio.pause();
      try { audio.currentTime = 0; } catch { /* metadata may not be loaded */ }
    }
    setActiveSegment(null);
  };
  const stopFull = ({ reset = true } = {}) => {
    const audio = fullAudioRef.current;
    if (audio) {
      audio.pause();
      if (reset) try { audio.currentTime = 0; } catch { /* metadata may not be loaded */ }
    }
    setPlaying(false);
    if (reset) setCurrentMs(0);
  };
  const returnToQuestions = () => {
    stopSegment();
    stopFull();
    setView(VIEW_QUESTIONS);
  };

  useEffect(() => {
    onStateChange?.(view);
  }, [onStateChange, view]);

  useEffect(() => {
    if (showTextCommand === initialCommand.current) return;
    initialCommand.current = showTextCommand;
    if (view === VIEW_QUESTIONS) {
      setError("");
      setView(VIEW_STATIC);
    } else returnToQuestions();
  // The command token is intentionally the sole trigger for this imperative navigation action.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTextCommand]);

  useEffect(() => {
    if (activeSegment === null) return undefined;
    const audio = segmentAudioRef.current;
    const source = segmentAssets[activeSegment]?.url;
    if (!audio || !source) return undefined;
    audio.currentTime = 0;
    const request = audio.play();
    request?.catch(() => {
      setError("This listening segment could not be played.");
      returnToQuestions();
    });
    return undefined;
  // segmentAssets contain hook state objects; the selected URL is the stable dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegment, segmentAssets[activeSegment]?.url]);

  useEffect(() => {
    if (activeSegment === null) return;
    const asset = segmentAssets[activeSegment];
    if (!asset?.error || asset.url) return;
    setError("This listening segment could not be played.");
    returnToQuestions();
  // The selected asset error is the only relevant failure signal.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegment, segmentAssets[activeSegment]?.error]);

  useEffect(() => {
    if (view !== VIEW_STATIC || activeSegment === null || !viewportRef.current) return;
    const regions = listeningAuthoring.questionSegments[activeSegment].regions;
    viewportRef.current.scrollTop = Math.max(0, regions[0].y - 64);
  }, [activeSegment, view]);

  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(animationRef.current);
      return undefined;
    }
    let lastUpdate = 0;
    const update = (timestamp) => {
      if (fullAudioRef.current && timestamp - lastUpdate >= 32) {
        lastUpdate = timestamp;
        setCurrentMs(Math.round(fullAudioRef.current.currentTime * 1000));
      }
      animationRef.current = requestAnimationFrame(update);
    };
    animationRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationRef.current);
  }, [playing]);

  const activeCue = findListeningCue(listeningAuthoring.karaoke.cues, currentMs);
  useEffect(() => {
    if (view !== VIEW_KARAOKE || !viewportRef.current) return;
    const scrollEntry = findListeningScrollEntry(listeningAuthoring.karaoke.scrollTimeline, currentMs);
    let target = scrollEntry?.scrollY || 0;
    if (activeCue) {
      const fragments = listeningAuthoring.karaoke.fragments.filter((fragment) => activeCue.fragmentIds.includes(fragment.id));
      const minimumY = Math.min(...fragments.map((fragment) => fragment.y));
      const maximumY = Math.max(...fragments.map((fragment) => fragment.y + fragment.height));
      const viewportHeight = listeningAuthoring.karaoke.viewport.height;
      if (minimumY < target + 28 || maximumY > target + viewportHeight - 28) target = Math.max(0, minimumY - 82);
    }
    viewportRef.current.scrollTop = target;
  }, [activeCue?.id, currentMs, view]);

  useEffect(() => () => {
    cancelAnimationFrame(animationRef.current);
    segmentAudioRef.current?.pause();
    fullAudioRef.current?.pause();
    onStateChange?.(VIEW_QUESTIONS);
  }, [onStateChange]);

  const playSegment = (index) => {
    setError("");
    stopFull();
    stopSegment();
    setView(VIEW_STATIC);
    setActiveSegment(index);
  };
  const playFull = async () => {
    setError("");
    stopSegment();
    setView(VIEW_KARAOKE);
    const audio = fullAudioRef.current;
    if (!audio || !fullAsset.url) {
      setError("The full reading audio is not available yet.");
      setView(VIEW_QUESTIONS);
      return;
    }
    try {
      await audio.play();
    } catch {
      setError("The full reading audio could not be played.");
      returnToQuestions();
    }
  };
  const pauseFull = () => fullAudioRef.current?.pause();
  const seekFull = (nextMs) => {
    if (fullAudioRef.current) fullAudioRef.current.currentTime = nextMs / 1000;
    setCurrentMs(nextMs);
  };
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (fullAudioRef.current) fullAudioRef.current.muted = next;
  };
  const player = (
    <TeacherListeningAudioPlayer
      currentMs={currentMs}
      durationMs={durationMs}
      playing={playing}
      muted={muted}
      onPlay={playFull}
      onPause={pauseFull}
      onStop={returnToQuestions}
      onSeek={seekFull}
      onToggleMute={toggleMute}
    />
  );

  return (
    <div className="teacher-listening-stage" data-listening-view={view}>
      {view === VIEW_QUESTIONS && <TeacherListeningQuestions activity={activity} images={images} error={error} questionProps={questionProps} onPlaySegment={playSegment} player={player} />}
      {view === VIEW_STATIC && <TeacherListeningStaticText images={images} activeSegment={activeSegment} viewportRef={viewportRef} />}
      {view === VIEW_KARAOKE && <TeacherListeningKaraoke images={images} activeCue={activeCue} viewportRef={viewportRef} player={player} />}
      <audio
        ref={fullAudioRef}
        className="teacher-listening-hidden-audio"
        src={fullAsset.url || undefined}
        preload="metadata"
        onPlay={() => { announceFullPlayback(); setPlaying(true); }}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(event) => setDurationMs(Math.round(event.currentTarget.duration * 1000))}
        onTimeUpdate={(event) => setCurrentMs(Math.round(event.currentTarget.currentTime * 1000))}
        onEnded={returnToQuestions}
        onError={() => { setError("The full reading audio could not be played."); returnToQuestions(); }}
      />
      {activeSegment !== null && (
        <audio
          key={activeSegment}
          ref={segmentAudioRef}
          className="teacher-listening-hidden-audio"
          src={segmentAssets[activeSegment]?.url || undefined}
          preload="auto"
          onPlay={announceSegmentPlayback}
          onEnded={returnToQuestions}
          onError={() => { setError("This listening segment could not be played."); returnToQuestions(); }}
        />
      )}
    </div>
  );
}

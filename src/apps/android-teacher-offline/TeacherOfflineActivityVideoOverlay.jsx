import { Captions, CaptionsOff, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { StudentsBookMediaPlayer } from "../../components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx";
import { findStudentsBookImplementation } from "../../data/ultimate-b2/studentsBookCatalog.js";
import { ultimateB2Unit1Part2LegacyImages } from "../../data/ultimate-b2/unit1Part2LegacyPilotAssets.js";

function timestampSeconds(value) {
  const parts = value.trim().split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

function parseWebVtt(source) {
  return String(source || "")
    .replace(/^\uFEFF?WEBVTT[^\n]*\n+/i, "")
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const lines = block.trim().split(/\r?\n/);
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) return null;
      const [start, endWithSettings] = lines[timingIndex].split("-->").map((part) => part.trim());
      const end = endWithSettings.split(/\s+/)[0];
      return {
        start: timestampSeconds(start),
        end: timestampSeconds(end),
        text: lines.slice(timingIndex + 1).join("\n").trim(),
      };
    })
    .filter((cue) => cue?.text && cue.end > cue.start);
}

function formatPlaybackTime(value) {
  const totalSeconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function TeacherOfflineActivityVideoOverlay({ activityId, onClose }) {
  const closeButtonRef = useRef(null);
  const videoRef = useRef(null);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionCues, setCaptionCues] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const activity = findStudentsBookImplementation(activityId);
  const video = activity?.mediaDependencies?.find((dependency) => dependency.type === "video" && dependency.logicalKey);
  const captions = ultimateB2Unit1Part2LegacyImages[activity?.stableNormalizedId]?.captions || null;
  const activeCaption = captionsEnabled
    ? captionCues.find((cue) => currentTime >= cue.start && currentTime <= cue.end)?.text || ""
    : "";

  useEffect(() => {
    let active = true;
    if (!captions) {
      setCaptionCues([]);
      return undefined;
    }
    fetch(captions)
      .then((response) => response.ok ? response.text() : Promise.reject(new Error("Captions unavailable")))
      .then((source) => {
        if (active) setCaptionCues(parseWebVtt(source));
      })
      .catch(() => {
        if (active) setCaptionCues([]);
      });
    return () => { active = false; };
  }, [captions]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  if (!video) return null;

  const togglePlayback = () => {
    const element = videoRef.current;
    if (!element) return;
    if (element.paused) element.play().catch(() => undefined);
    else element.pause();
  };
  const seekTo = (event) => {
    const nextTime = Number(event.currentTarget.value);
    if (!videoRef.current || !Number.isFinite(nextTime)) return;
    videoRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  };
  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
  };
  const changeVolume = (event) => {
    const nextVolume = Number(event.currentTarget.value);
    if (!videoRef.current || !Number.isFinite(nextVolume)) return;
    videoRef.current.volume = nextVolume;
    videoRef.current.muted = nextVolume === 0;
  };

  return (
    <section
      className="teacher-activity-video-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${activity.title || "Activity"} video`}
      data-activity-video-overlay=""
    >
      <div className="teacher-activity-video-panel">
        <header>
          <strong>{activity.visibleInstructionText || activity.title || "Activity video"}</strong>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close video" title="Close video"><X /></button>
        </header>
        <div className="teacher-activity-video-player">
          <StudentsBookMediaPlayer
            logicalKey={video.logicalKey}
            type="video"
            className="teacher-activity-video"
            captionTrack={captions}
            autoPlay
            controls
            mediaElementRef={videoRef}
            onTimeUpdate={setCurrentTime}
            onDurationChange={setDuration}
            onPlayStateChange={setPlaying}
            onVolumeChange={({ muted: nextMuted, volume: nextVolume }) => {
              setMuted(nextMuted);
              setVolume(nextVolume);
            }}
            onClick={togglePlayback}
          />
          {activeCaption && (
            <div className="teacher-activity-video-caption" aria-live="off">
              {activeCaption.split("\n").map((line, index) => <span key={`${index}-${line}`}>{line}</span>)}
            </div>
          )}
          {!playing && (
            <button type="button" className="teacher-activity-video-center-play" onClick={togglePlayback} aria-label="Play video">
              <Play fill="currentColor" />
            </button>
          )}
        </div>
        <div className="teacher-activity-video-controls">
          <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause video" : "Play video"} title={playing ? "Pause" : "Play"}>
            {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
          </button>
          <span className="teacher-activity-video-time">{formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}</span>
          <input
            className="teacher-activity-video-progress"
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={Math.min(currentTime, duration || 0)}
            onChange={seekTo}
            aria-label="Video position"
          />
          <button type="button" onClick={toggleMute} aria-label={muted || volume === 0 ? "Unmute video" : "Mute video"} title={muted || volume === 0 ? "Unmute" : "Mute"}>
            {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
          </button>
          <input
            className="teacher-activity-video-volume"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={muted ? 0 : volume}
            onChange={changeVolume}
            aria-label="Video volume"
          />
          {captions && (
            <button
              type="button"
              className={`teacher-activity-captions-toggle ${captionsEnabled ? "active" : ""}`}
              aria-pressed={captionsEnabled}
              aria-label={captionsEnabled ? "Turn subtitles off" : "Turn subtitles on"}
              onClick={() => setCaptionsEnabled((enabled) => !enabled)}
            >
              {captionsEnabled ? <Captions /> : <CaptionsOff />}
              <span>{captionsEnabled ? "Subtitles on" : "Subtitles off"}</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

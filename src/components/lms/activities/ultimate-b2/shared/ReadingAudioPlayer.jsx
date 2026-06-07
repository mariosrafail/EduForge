import { useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import unit2ReadingAudio from "../../../../../assets/books/ultimate-b2/media/unit_2_reading_on_a_fast_track.mp3";
import { CustomAudioProgress } from "./CustomAudioProgress.jsx";
import { formatMediaTime } from "./MediaTime.js";

export function ReadingAudioPlayer() {
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

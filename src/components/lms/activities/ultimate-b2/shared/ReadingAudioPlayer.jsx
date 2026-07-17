import { useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { ultimateB2ReadingAudio } from "virtual:ultimate-b2-media-assets";
import { useBookAsset } from "../../../../../hooks/useBookAsset.js";
import { captureMediaPlaybackState, restoreMediaPlaybackState } from "../../../../../services/mediaSourceLifecycle.js";
import { CustomAudioProgress } from "./CustomAudioProgress.jsx";
import { formatMediaTime } from "./MediaTime.js";

export function ReadingAudioPlayer() {
  const asset = useBookAsset(ultimateB2ReadingAudio.logicalKey, { devFallbackUrl: ultimateB2ReadingAudio.devFallbackUrl || ultimateB2ReadingAudio.localUrl, deferUrlUpdates: true });
  const audioRef = useRef(null);
  const resumeAfterRefreshRef = useRef(null);
  const refreshRecoveryAttemptsRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaSourceError, setMediaSourceError] = useState("");

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

  const retryMediaSource = () => {
    resumeAfterRefreshRef.current = captureMediaPlaybackState(audioRef.current, playing);
    refreshRecoveryAttemptsRef.current = 0;
    setMediaSourceError("");
    asset.refresh();
  };

  return (
    <div className="reading-audio-player">
      <audio
        ref={audioRef}
        className="sr-only"
        preload="metadata"
        src={asset.url || undefined}
        onLoadedMetadata={(event) => {
          refreshRecoveryAttemptsRef.current = 0;
          setMediaSourceError("");
          setDuration(event.currentTarget.duration || 0);
          const resume = resumeAfterRefreshRef.current;
          if (resume) {
            resumeAfterRefreshRef.current = null;
            restoreMediaPlaybackState(event.currentTarget, resume).catch(() => setPlaying(false));
          }
        }}
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
        onError={(event) => {
          if (!asset.url) return;
          if (refreshRecoveryAttemptsRef.current >= 1) { setMediaSourceError("Audio source could not be refreshed"); return; }
          refreshRecoveryAttemptsRef.current += 1;
          resumeAfterRefreshRef.current = captureMediaPlaybackState(event.currentTarget, playing);
          asset.recoverExpiredUrl();
        }}
      >
        <track kind="captions" />
      </audio>
      <div>
        <span className="eyebrow">Audio reading</span>
        <strong>On a fast track</strong>
        <small>Listen to the text before placing the missing sentences.</small>
      </div>
      <button type="button" className="thames-play-button" onClick={togglePlayback} disabled={!asset.url} aria-label={playing ? "Pause reading audio" : "Play reading audio"} data-sound-click="tab">
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
      {asset.loading && <small>Loading protected audio...</small>}
      {(asset.error || mediaSourceError) && <button type="button" className="secondary-action compact-action" onClick={retryMediaSource}>Retry audio</button>}
    </div>
  );
}

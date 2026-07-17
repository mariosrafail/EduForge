import { useRef, useState } from "react";
import { Maximize2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { ultimateB2ReadingVideo } from "virtual:ultimate-b2-media-assets";
import { useBookAsset } from "../../../../hooks/useBookAsset.js";
import { captureMediaPlaybackState, restoreMediaPlaybackState } from "../../../../services/mediaSourceLifecycle.js";
import { Tag } from "../../Shared.jsx";
import { formatMediaTime } from "./shared/MediaTime.js";

export function CustomVideoPlayer({ title = "Unit 2 Video Intro", subtitle = "Prepare for the Unit 2 reading text", durationLabel = "02:15", mode = "student", onWatched }) {
  const asset = useBookAsset(ultimateB2ReadingVideo.logicalKey, { devFallbackUrl: ultimateB2ReadingVideo.devFallbackUrl || ultimateB2ReadingVideo.localUrl, deferUrlUpdates: true });
  const videoRef = useRef(null);
  const resumeAfterRefreshRef = useRef(null);
  const refreshRecoveryAttemptsRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const [ended, setEnded] = useState(false);
  const [mediaSourceError, setMediaSourceError] = useState("");
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

  const retryMediaSource = () => {
    resumeAfterRefreshRef.current = captureMediaPlaybackState(videoRef.current, playing);
    refreshRecoveryAttemptsRef.current = 0;
    setMediaSourceError("");
    asset.refresh();
  };

  return (
    <div className={`custom-video-shell ${playing ? "is-playing" : ""} ${ended ? "is-ended" : ""}`}>
      <div className="custom-video-stage" onClick={togglePlayback} role="presentation">
        {(asset.loading || (!metadataLoaded && asset.url)) && <div className="custom-video-loading">Loading video...</div>}
        {(asset.error || mediaSourceError) && <div className="custom-video-loading">Video access needs refresh. <button type="button" onClick={retryMediaSource}>Retry</button></div>}
        <video
          ref={videoRef}
          preload="metadata"
          src={asset.url || undefined}
          playsInline
          onLoadedMetadata={(event) => {
            refreshRecoveryAttemptsRef.current = 0;
            setMediaSourceError("");
            setMetadataLoaded(true);
            setDuration(event.currentTarget.duration || 0);
            event.currentTarget.volume = volume;
            const resume = resumeAfterRefreshRef.current;
            if (resume) {
              resumeAfterRefreshRef.current = null;
              restoreMediaPlaybackState(event.currentTarget, resume).catch(() => setPlaying(false));
            }
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
          onPlay={() => { setPlaying(true); setEnded(false); }}
          onPause={() => setPlaying(false)}
          onEnded={markEnded}
          onError={(event) => {
            if (!asset.url) return;
            if (refreshRecoveryAttemptsRef.current >= 1) { setMediaSourceError("Video source could not be refreshed"); return; }
            refreshRecoveryAttemptsRef.current += 1;
            resumeAfterRefreshRef.current = captureMediaPlaybackState(event.currentTarget, playing);
            setMetadataLoaded(false);
            asset.recoverExpiredUrl();
          }}
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

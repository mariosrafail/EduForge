import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Captions, CaptionsOff, Download, Maximize2, Minimize2, Pause, Play, Volume2, VolumeX } from "lucide-react";

import { findTimedTextCue } from "../../data/timed-media/timedText.js";
import { PdfSaver } from "./pdfSaverPlugin.js";
import "./nativeVideo.css";

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}

export function NativeVideoPlayer({ video, src, worksheetSrc = "", autoPlayAttemptKey = "", ariaLabel = "Activity video player" }) {
  const shellRef = useRef(null);
  const videoRef = useRef(null);
  const recoveryRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(video.durationMs);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [message, setMessage] = useState("");
  const [sourceRetry, setSourceRetry] = useState(0);
  const cue = captionsEnabled ? findTimedTextCue(video.cues, currentMs) : null;
  const resolvedSrc = sourceRetry ? `${src}${src.includes("?") ? "&" : "?"}nativeVideoRetry=${sourceRetry}` : src;

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    recoveryRef.current = 0;
    setSourceRetry(0);
    setCurrentMs(0);
    setDurationMs(video.durationMs);
    setMessage("");
  }, [src, video.assetSlot]);

  useEffect(() => {
    if (!autoPlayAttemptKey || !videoRef.current) return undefined;
    const frame = globalThis.requestAnimationFrame(() => {
      videoRef.current?.play().catch(() => setMessage("Press Play to start the video."));
    });
    return () => globalThis.cancelAnimationFrame(frame);
  }, [autoPlayAttemptKey, src]);

  useEffect(() => {
    const element = videoRef.current;
    const shell = shellRef.current;
    return () => {
      if (element) element.pause();
      if (document.fullscreenElement === shell) document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  const togglePlayback = () => {
    const element = videoRef.current;
    if (!element) return;
    if (element.paused) element.play().catch(() => setMessage("Video playback could not start."));
    else element.pause();
  };
  const seek = (event) => {
    const nextMs = Number(event.currentTarget.value);
    if (!videoRef.current || !Number.isFinite(nextMs)) return;
    videoRef.current.currentTime = nextMs / 1_000;
    setCurrentMs(nextMs);
  };
  const toggleMute = () => {
    const element = videoRef.current;
    if (!element) return;
    element.muted = !element.muted;
    setMuted(element.muted);
  };
  const changeVolume = (event) => {
    const next = Number(event.currentTarget.value);
    if (!videoRef.current || !Number.isFinite(next)) return;
    videoRef.current.volume = next;
    videoRef.current.muted = next === 0;
    setVolume(next);
    setMuted(next === 0);
  };
  const toggleFullscreen = async () => {
    setMessage("");
    if (document.fullscreenElement === shellRef.current) {
      try { await document.exitFullscreen(); } catch { setMessage("Use Escape or the browser control to exit fullscreen."); }
      return;
    }
    if (!document.fullscreenEnabled || !shellRef.current?.requestFullscreen) {
      setMessage("Fullscreen is unavailable in this browser.");
      return;
    }
    try { await shellRef.current.requestFullscreen(); } catch { setMessage("Fullscreen could not be opened."); }
  };
  const downloadWorksheet = async (event) => {
    if (!video.worksheet || !Capacitor.isNativePlatform()) return;
    event.preventDefault();
    try {
      await PdfSaver.savePdf({ assetPath: new URL(worksheetSrc, globalThis.location.href).pathname, filename: video.worksheet.fileName });
    } catch { setMessage("Video Worksheet could not be saved."); }
  };

  return <section ref={shellRef} className="native-video-player-shell" data-native-video-player-shell="" data-fullscreen={fullscreen || undefined} aria-label={ariaLabel}>
    <div className="native-video-stage" onClick={togglePlayback} role="presentation">
      <video
        ref={videoRef}
        src={resolvedSrc}
        preload="metadata"
        playsInline
        onLoadedMetadata={(event) => {
          recoveryRef.current = 0;
          setMessage("");
          setDurationMs(Math.round((event.currentTarget.duration || video.durationMs / 1_000) * 1_000));
          event.currentTarget.volume = volume;
        }}
        onTimeUpdate={(event) => setCurrentMs(Math.round(event.currentTarget.currentTime * 1_000))}
        onSeeked={(event) => setCurrentMs(Math.round(event.currentTarget.currentTime * 1_000))}
        onPlay={(event) => {
          setPlaying(true);
          shellRef.current?.closest(".native-readable-text-presentation, .book-page-spread-view, .teacher-offline-embedded-activity, .teacher-offline-pages")?.querySelectorAll("audio, video").forEach((media) => { if (media !== event.currentTarget) media.pause(); });
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          if (recoveryRef.current >= 1) { setMessage("Video access could not be refreshed."); return; }
          recoveryRef.current += 1;
          setSourceRetry((current) => current + 1);
        }}
      />
      {cue ? <div className="native-video-caption" aria-live="off">{cue.text.split("\n").map((line, index) => <span key={`${cue.id}-${index}`}>{line}</span>)}</div> : null}
      {!playing ? <button type="button" className="native-video-center-play" onClick={(event) => { event.stopPropagation(); togglePlayback(); }} aria-label="Play video"><Play fill="currentColor" /></button> : null}
    </div>
    <div className="native-video-controls" onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause video" : "Play video"} title={playing ? "Pause" : "Play"}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
      <output aria-label="Video time">{formatTime(currentMs)} / {formatTime(durationMs)}</output>
      <input type="range" className="native-video-progress" min="0" max={Math.max(durationMs, 1)} step="100" value={Math.min(currentMs, Math.max(durationMs, 1))} onChange={seek} aria-label="Video position" />
      <button type="button" onClick={toggleMute} aria-label={muted || volume === 0 ? "Unmute video" : "Mute video"} title={muted || volume === 0 ? "Unmute" : "Mute"}>{muted || volume === 0 ? <VolumeX /> : <Volume2 />}</button>
      <input type="range" className="native-video-volume" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={changeVolume} aria-label="Video volume" />
      {video.worksheet && worksheetSrc ? <a className="native-video-worksheet" href={worksheetSrc} download={video.worksheet.fileName} type="application/pdf" onClick={downloadWorksheet}><Download aria-hidden="true" /><span>Video Worksheet</span></a> : null}
      {video.cues.length ? <button type="button" className="native-video-captions" aria-pressed={captionsEnabled} onClick={() => setCaptionsEnabled((current) => !current)} aria-label={captionsEnabled ? "Turn subtitles off" : "Turn subtitles on"} title={captionsEnabled ? "Subtitles on" : "Subtitles off"}>{captionsEnabled ? <Captions aria-hidden="true" /> : <CaptionsOff aria-hidden="true" />}<span>Subtitles</span></button> : null}
      <button type="button" className={`native-video-fullscreen${fullscreen ? " native-video-exit-fullscreen" : ""}`} onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Open fullscreen"} title={fullscreen ? "Exit fullscreen" : "Fullscreen"}>{fullscreen ? <Minimize2 /> : <Maximize2 />}<span>{fullscreen ? "Exit Fullscreen" : "Fullscreen"}</span></button>
    </div>
    {message ? <p className="native-video-message" role="status">{message}</p> : null}
  </section>;
}

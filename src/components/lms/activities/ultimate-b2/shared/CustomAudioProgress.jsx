import { useRef } from "react";
import { formatMediaTime } from "./MediaTime.js";

export function CustomAudioProgress({ currentTime, duration, onSeek, ariaLabel = "Audio progress" }) {
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

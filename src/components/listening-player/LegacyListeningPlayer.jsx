import { Pause, Play, Square, Volume2, VolumeX } from "lucide-react";

import "./legacyListeningPlayer.css";

function PlayerButton({ label, source, pressedSource, icon: Icon, disabled = false, onClick }) {
  return <button type="button" className="legacy-listening-player-button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
    {source ? <><img className="normal" src={source} alt="" draggable="false" /><img className="pressed" src={pressedSource} alt="" draggable="false" /></> : <Icon aria-hidden="true" />}
  </button>;
}
export function LegacyListeningPlayer({
  assets,
  currentMs,
  durationMs,
  playing,
  muted,
  disabled = false,
  formatTime,
  onPlay,
  onPause,
  onStop,
  onSeek,
  onToggleMute,
  ariaLabel = "Listening audio player",
  playLabel = "Play Listening audio",
  pauseLabel = "Pause Listening audio",
  stopLabel = "Stop Listening audio",
}) {
  const maximum = Math.max(0, durationMs);
  if (!assets) return null;
  return <div className="legacy-listening-player" aria-label={ariaLabel} data-css-chrome={!assets.background || undefined}>
    {assets.background ? <img className="legacy-listening-player-background" src={assets.background} alt="" draggable="false" /> : <span className="legacy-listening-player-background" aria-hidden="true" />}
    <input className="legacy-listening-player-seek" type="range" min="0" max={Math.max(maximum, 1)} step="1" value={Math.min(currentMs, Math.max(maximum, 1))} aria-label="Listening audio position" disabled={disabled || !maximum} onChange={(event) => onSeek(Number(event.target.value))} />
    <div className="legacy-listening-player-controls">
      <PlayerButton label={playLabel} source={assets.play?.active} pressedSource={assets.play?.pressed} icon={Play} disabled={disabled} onClick={onPlay} />
      <PlayerButton label={pauseLabel} source={assets.pause?.active} pressedSource={assets.pause?.pressed} icon={Pause} disabled={disabled || !playing} onClick={onPause} />
      <PlayerButton label={stopLabel} source={assets.stop?.active} pressedSource={assets.stop?.pressed} icon={Square} disabled={disabled || (!currentMs && !playing)} onClick={onStop} />
      <button type="button" className="legacy-listening-player-mute" aria-label={muted ? "Unmute Listening audio" : "Mute Listening audio"} aria-pressed={muted} disabled={disabled} onClick={onToggleMute}>{muted ? <VolumeX /> : <Volume2 />}</button>
    </div>
    <output className="legacy-listening-player-time" aria-label="Listening audio time">{formatTime(currentMs)} / {formatTime(maximum)}</output>
  </div>;
}

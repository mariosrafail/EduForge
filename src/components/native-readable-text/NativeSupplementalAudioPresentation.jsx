import { useEffect, useRef, useState } from "react";

import { LegacyListeningPlayer } from "../listening-player/LegacyListeningPlayer.jsx";
import { formatNativeListeningTime } from "../native-listening/nativeListeningRuntime.js";
import { nativeListeningPlayerAssets } from "../native-listening/nativeListeningPlayerAssets.js";
import { pauseSiblingNativeMedia } from "./nativeMediaArbitration.js";
import { NativeScrollControlsHost } from "./NativeScrollControlsHost.jsx";
import { NativeVerticalScrollViewport } from "./NativeVerticalScrollViewport.jsx";
import "./nativeSupplementalAudio.css";

export function NativeSupplementalAudioPresentation({ document, assetUrl, presentationView, command = null }) {
  const supplementalAudio = document.supplementalAudio;
  const audioRef = useRef(null);
  const lastCommandToken = useRef(command?.token);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [error, setError] = useState(false);
  const audioAsset = supplementalAudio ? document.assets.find((asset) => asset.slot === supplementalAudio.assetSlot) : null;
  const referenceAsset = supplementalAudio?.reference ? document.assets.find((asset) => asset.slot === supplementalAudio.reference.assetSlot) : null;

  const stop = () => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setPlaying(false); setCurrentMs(0);
  };

  useEffect(() => {
    stop(); setReferenceOpen(false); setMuted(false); setError(false);
  }, [document.activityId, supplementalAudio?.assetSlot]);
  useEffect(() => () => audioRef.current?.pause(), []);
  useEffect(() => {
    if (presentationView === "questions") return;
    setReferenceOpen(false);
    if (presentationView === "video") audioRef.current?.pause();
  }, [presentationView]);
  useEffect(() => {
    if (!command || command.token === lastCommandToken.current) return;
    lastCommandToken.current = command.token;
    setReferenceOpen(false);
    if (command.type === "reset-activity") stop();
  }, [command]);
  useEffect(() => {
    if (!referenceOpen) return undefined;
    const close = (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) setReferenceOpen(false);
    };
    globalThis.addEventListener("keydown", close);
    return () => globalThis.removeEventListener("keydown", close);
  }, [referenceOpen]);

  if (!supplementalAudio || !audioAsset) return null;
  const play = () => {
    if (!audioRef.current) return;
    setError(false);
    if (audioRef.current.ended || currentMs >= supplementalAudio.durationMs) { audioRef.current.currentTime = 0; setCurrentMs(0); }
    audioRef.current.play().catch(() => setError(true));
  };
  const pause = () => audioRef.current?.pause();
  const seek = (milliseconds) => {
    if (!audioRef.current || !Number.isFinite(milliseconds)) return;
    audioRef.current.currentTime = milliseconds / 1_000; setCurrentMs(milliseconds);
  };
  const toggleMute = () => {
    const next = !muted; setMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  };
  const toggleReference = () => {
    setReferenceOpen((current) => !current);
  };
  const referenceAction = supplementalAudio.reference && referenceAsset ? {
    label: referenceOpen ? "Close supplemental audio Reference" : "Open supplemental audio Reference",
    title: "Reference",
    pressed: referenceOpen,
    onClick: toggleReference,
  } : null;

  return <>
    {referenceOpen && supplementalAudio.reference && referenceAsset ? <NativeScrollControlsHost as="section" inherit={false} className="native-readable-text-view native-supplemental-audio-reference" aria-label="Supplemental audio Reference" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <NativeVerticalScrollViewport id={`${document.activityId}-supplemental-audio-reference-scroll`} className="native-readable-text-scroll" ariaLabel="Supplemental audio Reference vertical scroll" resetKey={`${document.activityId}:${referenceAsset.assetId}`}>
        <img src={assetUrl(referenceAsset.assetId)} alt={supplementalAudio.reference.altText} width={supplementalAudio.reference.sourceWidth} height={supplementalAudio.reference.sourceHeight} />
      </NativeVerticalScrollViewport>
    </NativeScrollControlsHost> : null}
    {presentationView !== "video" ? <div className="native-supplemental-audio-anchor" data-stacked={document.kind === "listening" || undefined} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <LegacyListeningPlayer assets={nativeListeningPlayerAssets} currentMs={currentMs} durationMs={supplementalAudio.durationMs} playing={playing} muted={muted} disabled={error} formatTime={formatNativeListeningTime} onPlay={play} onPause={pause} onStop={stop} onSeek={seek} onToggleMute={toggleMute} ariaLabel="Supplemental audio player" playLabel="Play supplemental audio" pauseLabel="Pause supplemental audio" stopLabel="Stop supplemental audio" extraAction={referenceAction} />
      {error ? <p className="native-supplemental-audio-error" role="alert">Supplemental audio could not be played.</p> : null}
    </div> : null}
    <audio ref={audioRef} hidden preload="metadata" src={assetUrl(audioAsset.assetId)} onPlay={(event) => { pauseSiblingNativeMedia(event.currentTarget); setPlaying(true); }} onPause={() => setPlaying(false)} onTimeUpdate={(event) => setCurrentMs(Math.round(event.currentTarget.currentTime * 1_000))} onSeeked={(event) => setCurrentMs(Math.round(event.currentTarget.currentTime * 1_000))} onEnded={stop} onError={() => setError(true)} />
  </>;
}

import { useEffect, useRef } from "react";

import audioHotspotActive from "../../assets/native-activities/audio-text-hotspot-active.svg";
import audioHotspotPressed from "../../assets/native-activities/audio-text-hotspot-pressed.svg";
import { logicalAreaStyle } from "../builder-studio/stageGeometry.js";

export const nativeAudioHotspotArtwork = Object.freeze({ active: audioHotspotActive, pressed: audioHotspotPressed });

export function NativeAudioTextHotspotButtons({ panelId = null, surface, presentation = null }) {
  if (!presentation || !surface) return null;
  return presentation.hotspots.filter((hotspot) => hotspot.panelId === panelId).map((hotspot) => {
    const active = presentation.activeHotspotId === hotspot.id;
    return <button
      key={hotspot.id}
      type="button"
      className="native-audio-text-hotspot"
      style={logicalAreaStyle(hotspot.activityArea, surface)}
      aria-label={hotspot.label}
      aria-pressed={active}
      onClick={() => presentation.onToggle(hotspot.id)}
    ><img src={active ? audioHotspotPressed : audioHotspotActive} alt="" /></button>;
  });
}

export function NativeAudioTextFocusContent({ document, hotspot, assetUrl, onClose = null, autoPlay = false }) {
  const audioRef = useRef(null);
  const readableReference = document.assets.find((asset) => asset.slot === document.readableText?.assetSlot);
  const audioReference = document.assets.find((asset) => asset.slot === hotspot?.audioAssetSlot);
  useEffect(() => {
    if (!autoPlay || !audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } };
  }, [autoPlay, hotspot?.id]);
  if (!hotspot || !readableReference || !audioReference) return null;
  const focus = hotspot.readableFocusArea;
  return <section className="native-audio-text-focus" aria-label={`Focused readable text: ${hotspot.label}`}>
    <header><strong>{hotspot.label}</strong>{onClose ? <button type="button" onClick={onClose} aria-label="Close audio text focus">Close</button> : null}</header>
    <div className="native-audio-text-focus-crop">
      <svg viewBox={`${focus.x} ${focus.y} ${focus.width} ${focus.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${document.readableText.altText}: ${hotspot.label}`}>
        <image href={assetUrl(readableReference.assetId)} x="0" y="0" width={document.readableText.sourceWidth} height={document.readableText.sourceHeight} preserveAspectRatio="none" />
      </svg>
    </div>
    <audio ref={audioRef} controls autoPlay={autoPlay} preload="metadata" src={assetUrl(audioReference.assetId)} aria-label={`Audio for ${hotspot.label}`} />
  </section>;
}

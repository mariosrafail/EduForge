import { useEffect, useRef, useState } from "react";

import { useTeacherRuntimeUiAssets } from "./legacyClassroomAssets.js";
import { parseGaf, renderGafFrame } from "./legacyGaf.js";

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load recovered animation atlas: ${source}`));
    image.src = source;
  });
}

export default function LegacyMenuTitleAnimation({ animate = true, label = "Ultimate B2 English" }) {
  const runtimeUiAssets = useTeacherRuntimeUiAssets();
  const canvasRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const controller = new AbortController();
    let animationFrame = 0;
    let disposed = false;
    const title = runtimeUiAssets.classroom.branding.menuTitle;

    fetch(title.gaf, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error("Unable to load the recovered GAF menu title.");
      return response.arrayBuffer();
    }).then(parseGaf).then(async (config) => {
      if (disposed) return;
      const renderScale = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1, canvas.clientWidth / config.timeline.bounds.width));
      const contentScaleFactor = renderScale > 1 ? 2 : 1;
      const atlases = await Promise.all((contentScaleFactor === 2 ? title.hd : title.sd).map(loadImage));
      if (disposed) return;
      canvas.width = Math.round(config.timeline.bounds.width * renderScale);
      canvas.height = Math.round(config.timeline.bounds.height * renderScale);
      const context = canvas.getContext("2d", { alpha: true });
      const stillFrame = config.frames.length - 1;
      if (!animate) {
        renderGafFrame(context, config, atlases, stillFrame, contentScaleFactor);
        canvas.dataset.animationState = "paused";
        return;
      }
      const started = performance.now();
      const draw = (now) => {
        if (disposed) return;
        const frame = Math.floor(((now - started) * config.stage.fps) / 1000) % config.frames.length;
        renderGafFrame(context, config, atlases, frame, contentScaleFactor);
        canvas.dataset.animationState = "playing";
        animationFrame = requestAnimationFrame(draw);
      };
      animationFrame = requestAnimationFrame(draw);
    }).catch((reason) => {
      if (!disposed && reason?.name !== "AbortError") setError(label);
    });

    return () => {
      disposed = true;
      controller.abort();
      cancelAnimationFrame(animationFrame);
    };
  }, [animate, label, runtimeUiAssets]);

  return (
    <div className="legacy-menu-title-animation" role="img" aria-label={label}>
      <canvas ref={canvasRef} aria-hidden="true" />
      {error && <span className="legacy-menu-title-fallback">{error}</span>}
    </div>
  );
}

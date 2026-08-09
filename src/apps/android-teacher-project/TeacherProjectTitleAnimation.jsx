import { useEffect, useRef, useState } from "react";

import { parseGaf, renderGafFrame } from "../android-teacher-offline/legacyGaf.js";

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load a title animation atlas."));
    image.src = source;
  });
}

export default function TeacherProjectTitleAnimation({ bundle, animate = true, editing = false }) {
  const canvasRef = useRef(null);
  const [error, setError] = useState("");
  const ready = Boolean(bundle?.gaf && bundle.sdAtlases?.length && bundle.hdAtlases?.length);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return undefined;
    const controller = new AbortController();
    let animationFrame = 0;
    let disposed = false;
    setError("");
    fetch(bundle.gaf, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error("Unable to load the GAF title animation.");
      return response.arrayBuffer();
    }).then(parseGaf).then(async (config) => {
      if (disposed) return;
      const renderScale = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1, canvas.clientWidth / config.timeline.bounds.width));
      const contentScaleFactor = renderScale > 1 ? 2 : 1;
      const sources = contentScaleFactor === 2 ? bundle.hdAtlases : bundle.sdAtlases;
      const atlases = await Promise.all(sources.map(loadImage));
      if (disposed) return;
      canvas.width = Math.round(config.timeline.bounds.width * renderScale);
      canvas.height = Math.round(config.timeline.bounds.height * renderScale);
      const context = canvas.getContext("2d", { alpha: true });
      if (!animate) {
        renderGafFrame(context, config, atlases, config.frames.length - 1, contentScaleFactor);
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
      if (!disposed && reason?.name !== "AbortError") setError(editing ? "Title animation could not be previewed" : bundle.accessibleLabel);
    });
    return () => {
      disposed = true;
      controller.abort();
      cancelAnimationFrame(animationFrame);
    };
  }, [animate, bundle, editing, ready]);

  return (
    <div className={`legacy-menu-title-animation teacher-project-title${ready ? "" : " is-placeholder"}`} role="img" aria-label={bundle?.accessibleLabel || "Teacher project title animation"}>
      {ready ? <canvas ref={canvasRef} aria-hidden="true" /> : <span className="teacher-project-asset-placeholder">{editing ? "GAF title animation" : bundle?.accessibleLabel || "Title"}</span>}
      {error && <span className="legacy-menu-title-fallback">{error}</span>}
    </div>
  );
}

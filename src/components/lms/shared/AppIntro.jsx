import { useEffect, useState } from "react";

const pieces = Array.from({ length: 24 }, (_, index) => index + 1);
const LOGO_ANIMATION_MS = 1100;
const HOLD_AFTER_COMPLETE_MS = 500;
const FADE_OUT_MS = 520;
const REDUCED_MOTION_MS = 100;

export function AppIntro() {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const enterMs = reduceMotion ? REDUCED_MOTION_MS : LOGO_ANIMATION_MS;
    const holdMs = reduceMotion ? REDUCED_MOTION_MS : HOLD_AFTER_COMPLETE_MS;
    const exitMs = reduceMotion ? REDUCED_MOTION_MS : FADE_OUT_MS;
    const holdTimer = window.setTimeout(() => setExiting(true), enterMs + holdMs);
    const doneTimer = window.setTimeout(() => setVisible(false), enterMs + holdMs + exitMs);
    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(doneTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`app-intro-overlay ${exiting ? "is-exiting" : ""}`} aria-hidden="true">
      <div className="app-intro-mark">
        {pieces.map((piece) => <span key={piece} className={`intro-piece piece-${piece}`} />)}
      </div>
      <div className="app-intro-copy">
        <strong>Hamilton House Publishers</strong>
        <span>Digital ELT lesson platform</span>
      </div>
    </div>
  );
}

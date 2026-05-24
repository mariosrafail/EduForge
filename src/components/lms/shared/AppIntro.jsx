import { useEffect, useState } from "react";

const pieces = Array.from({ length: 20 }, (_, index) => index + 1);

export function AppIntro() {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const holdMs = reduceMotion ? 80 : 1050;
    const exitMs = reduceMotion ? 80 : 320;
    const holdTimer = window.setTimeout(() => setExiting(true), holdMs);
    const doneTimer = window.setTimeout(() => setVisible(false), holdMs + exitMs);
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

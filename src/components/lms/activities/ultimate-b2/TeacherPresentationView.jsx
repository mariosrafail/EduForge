import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Expand, Minimize2 } from "lucide-react";

import {
  adjacentEnabledStudentsBookActivity,
  enabledStudentsBookActivitySequence,
  findStudentsBookImplementation,
  isStudentsBookActivityEnabled,
} from "../../../../data/ultimate-b2/studentsBookCatalog.js";
import { buildTeacherPresentationHash } from "../../../../utils/hashRoutes.js";
import { UltimateB2ActivityRunner } from "./UltimateB2ActivityRunner.jsx";

const bookRoute = "/teacher/books/ultimate-b2/components/students-book/exercises";

export function TeacherPresentationView({ activityKey, navigateTo }) {
  const stageRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState("");
  const activity = findStudentsBookImplementation(activityKey);
  const sequence = useMemo(() => enabledStudentsBookActivitySequence(), []);
  const previous = activity ? adjacentEnabledStudentsBookActivity(activity.stableNormalizedId, -1) : null;
  const next = activity ? adjacentEnabledStudentsBookActivity(activity.stableNormalizedId, 1) : null;
  const position = activity ? sequence.findIndex((exercise) => exercise.stableActivityId === activity.stableNormalizedId) + 1 : 0;
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const updateFullscreenState = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  useEffect(() => {
    setFullscreenMessage("");
  }, [activityKey]);

  if (!activity || !isStudentsBookActivityEnabled(activity)) {
    return (
      <main className="teacher-presentation-shell presentation-error-state">
        <h1>Activity unavailable</h1>
        <p>This activity does not exist or is disabled for presentation.</p>
        <button className="primary-action" type="button" onClick={() => navigateTo(bookRoute)}>
          <ArrowLeft size={20} /> Back to book
        </button>
      </main>
    );
  }

  const navigateActivity = (exercise) => {
    if (exercise) navigateTo(buildTeacherPresentationHash(exercise.stableActivityId));
  };

  const enterFullscreen = async () => {
    const fullscreenAvailable = typeof document !== "undefined"
      && Boolean(document.fullscreenEnabled && stageRef.current?.requestFullscreen);
    if (!fullscreenAvailable) {
      setFullscreenMessage("Fullscreen is unavailable in this browser. Presentation mode remains fully usable.");
      return;
    }
    try {
      await stageRef.current.requestFullscreen();
    } catch {
      setFullscreenMessage("Fullscreen could not be opened. Presentation mode remains fully usable.");
    }
  };

  const exitFullscreen = async () => {
    if (!document.fullscreenElement) return;
    try {
      await document.exitFullscreen();
    } catch {
      setFullscreenMessage("Use the browser’s fullscreen control or Escape to exit.");
    }
  };

  return (
    <main ref={stageRef} className={`teacher-presentation-shell ${isFullscreen ? "is-fullscreen" : ""}`}>
      <header className="teacher-presentation-toolbar">
        <button className="presentation-toolbar-button" type="button" onClick={() => navigateTo(bookRoute)}>
          <ArrowLeft size={22} /> Back to book
        </button>
        <div className="teacher-presentation-context">
          <span>Ultimate B2 · Students Book · Unit {activity.unitNumber}</span>
          <strong>{activity.sectionTitle} · Page {activity.printedPage}</strong>
          <small>Activity {position} of {sequence.length}</small>
        </div>
        {isFullscreen ? (
          <button className="presentation-toolbar-button" type="button" onClick={exitFullscreen}>
            <Minimize2 size={22} /> Exit fullscreen
          </button>
        ) : (
          <button className="presentation-toolbar-button" type="button" onClick={enterFullscreen}>
            <Expand size={22} /> Fullscreen
          </button>
        )}
      </header>

      {fullscreenMessage && <div className="presentation-fullscreen-message" role="status">{fullscreenMessage}</div>}

      <section className="teacher-presentation-stage" aria-label="Teacher presentation activity">
        <UltimateB2ActivityRunner
          key={activity.stableNormalizedId}
          activityKey={activity.stableNormalizedId}
          mode="teacher-presentation"
          navigateTo={navigateTo}
          hideBreadcrumb
        />
      </section>

      <nav className="teacher-presentation-navigation" aria-label="Enabled Students Book activities">
        <button className="presentation-nav-button" type="button" disabled={!previous} onClick={() => navigateActivity(previous)}>
          <ChevronLeft size={24} /> Previous activity
        </button>
        <span>{position} / {sequence.length} enabled activities</span>
        <button className="presentation-nav-button" type="button" disabled={!next} onClick={() => navigateActivity(next)}>
          Next activity <ChevronRight size={24} />
        </button>
      </nav>
    </main>
  );
}

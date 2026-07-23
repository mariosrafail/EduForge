import { ArrowLeft, ChevronLeft, ChevronRight, Expand, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { NormalizedStudentsBookActivity } from "../../components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx";
import { ACTIVITY_MODES } from "../../components/lms/activities/activityModes.js";

export default function TeacherOfflinePresentation({
  activityId,
  activities,
  onBack,
  onNavigate,
}) {
  const stageRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const index = activities.findIndex((activity) => activity.stableActivityId === activityId);
  const activity = activities[index] || null;
  const previous = index > 0 ? activities[index - 1] : null;
  const next = index >= 0 && index < activities.length - 1 ? activities[index + 1] : null;

  useEffect(() => {
    const update = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen?.();
    } catch {
      // Android immersive mode remains active when the browser fullscreen API is unavailable.
    }
  };

  if (!activity) {
    return (
      <main className="teacher-offline-status damaged">
        <h1>Activity unavailable</h1>
        <p>This activity is unknown or disabled in the installed pack.</p>
        <button type="button" className="teacher-primary-button" onClick={onBack}>Back to book</button>
      </main>
    );
  }

  return (
    <main ref={stageRef} className="teacher-offline-presentation">
      <header>
        <button type="button" onClick={onBack}><ArrowLeft size={22} /> Back to book</button>
        <div>
          <span>Ultimate B2 · Students Book · Unit {activity.unitNumber}</span>
          <strong>{activity.sectionTitle} · Page {activity.printedPage}</strong>
          <small>Activity {index + 1} of {activities.length}</small>
        </div>
        <button type="button" onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize2 size={22} /> : <Expand size={22} />}
          {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </header>
      <section className="teacher-offline-presentation-stage">
        <NormalizedStudentsBookActivity
          key={activityId}
          activityId={activityId}
          mode={ACTIVITY_MODES.TEACHER_PRESENTATION_OFFLINE}
        />
      </section>
      <nav aria-label="Enabled Students Book activities">
        <button type="button" disabled={!previous} onClick={() => onNavigate(previous.stableActivityId)}>
          <ChevronLeft size={24} /> Previous
        </button>
        <span>{index + 1} / {activities.length} enabled activities</span>
        <button type="button" disabled={!next} onClick={() => onNavigate(next.stableActivityId)}>
          Next <ChevronRight size={24} />
        </button>
      </nav>
    </main>
  );
}

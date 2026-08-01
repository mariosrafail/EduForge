import { NormalizedStudentsBookActivity } from "../../components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx";
import { ACTIVITY_MODES } from "../../components/lms/activities/activityModes.js";
import { LegacyClassroomIcon } from "./legacyClassroomAssets.js";
import ClassroomStageTransform from "./ClassroomStageTransform.jsx";
import ClassroomToolOverlay from "./ClassroomToolOverlay.jsx";
import ClassroomToolbar from "./ClassroomToolbar.jsx";

export default function TeacherOfflinePresentation({ activityId, activities, onBack, onNavigate }) {
  const index = activities.findIndex((activity) => activity.stableActivityId === activityId);
  const activity = activities[index] || null;
  const previous = index > 0 ? activities[index - 1] : null;
  const next = index >= 0 && index < activities.length - 1 ? activities[index + 1] : null;

  if (!activity) {
    return (
      <main className="teacher-offline-status damaged">
        <h1>Activity unavailable</h1>
        <p>This activity is unknown or disabled in the installed pack.</p>
        <button type="button" className="teacher-primary-button" onClick={onBack}>Back to book</button>
      </main>
    );
  }

  const surfaceKey = `students-book:activity:${activityId}`;
  return (
    <main className="teacher-offline-presentation has-classroom-tools">
      <header>
        <button type="button" onClick={onBack}><LegacyClassroomIcon name="back" /> Back to book</button>
        <div>
          <span>Ultimate B2 · Students Book · Unit {activity.unitNumber}</span>
          <strong>{activity.sectionTitle} · Page {activity.printedPage}</strong>
          <small>Activity {index + 1} of {activities.length}</small>
        </div>
        <div aria-hidden="true" />
      </header>
      <section className="teacher-offline-presentation-stage" data-classroom-surface-id={surfaceKey} tabIndex={-1}>
        <ClassroomStageTransform surfaceKey={surfaceKey}>
          <NormalizedStudentsBookActivity key={activityId} activityId={activityId} mode={ACTIVITY_MODES.TEACHER_PRESENTATION_OFFLINE} />
          <ClassroomToolOverlay surfaceKey={surfaceKey} />
        </ClassroomStageTransform>
      </section>
      <ClassroomToolbar surfaceKey={surfaceKey} />
      <nav aria-label="Enabled Students Book activities">
        <button type="button" disabled={!previous} onClick={() => onNavigate(previous.stableActivityId)}><LegacyClassroomIcon name="previous" /> Previous</button>
        <span>{index + 1} / {activities.length} enabled activities</span>
        <button type="button" disabled={!next} onClick={() => onNavigate(next.stableActivityId)}>Next <LegacyClassroomIcon name="next" /></button>
      </nav>
    </main>
  );
}

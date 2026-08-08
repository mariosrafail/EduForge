import { StudentsBookMediaPlayer } from "../../components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx";
import ClassroomStageTransform from "./ClassroomStageTransform.jsx";
import ClassroomToolOverlay from "./ClassroomToolOverlay.jsx";
import ClassroomToolbar from "./UltimateB2ClassroomToolbar.jsx";
import TeacherBookNavigation from "./TeacherBookNavigation.jsx";

export default function TeacherOfflineMedia({ media, onBack, onHome }) {
  const surfaceKey = `students-book:media:${media?.logicalKey || "unavailable"}`;
  return (
    <main className="teacher-offline-media has-classroom-tools">
      <header>
        <div>
          <span className="teacher-offline-eyebrow">Local classroom media</span>
          <h1>{media?.label || "Book media"}</h1>
        </div>
      </header>
      <section data-classroom-surface-id={surfaceKey} tabIndex={-1}>
        <ClassroomStageTransform surfaceKey={surfaceKey}>
        {media?.logicalKey ? (
          <StudentsBookMediaPlayer
            logicalKey={media.logicalKey}
            type={media.type}
            className="teacher-offline-standalone-media"
          />
        ) : (
          <div className="teacher-offline-asset-error">This optional media item is unavailable.</div>
        )}
        <ClassroomToolOverlay surfaceKey={surfaceKey} />
        </ClassroomStageTransform>
      </section>
      <TeacherBookNavigation onHome={onHome} onBack={onBack} />
      <ClassroomToolbar surfaceKey={surfaceKey} />
    </main>
  );
}

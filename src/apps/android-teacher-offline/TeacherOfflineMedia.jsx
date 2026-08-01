import { useState } from "react";

import { StudentsBookMediaPlayer } from "../../components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx";
import { LegacyClassroomIcon } from "./legacyClassroomAssets.js";
import ClassroomToolOverlay from "./ClassroomToolOverlay.jsx";
import ClassroomToolbar from "./ClassroomToolbar.jsx";

export default function TeacherOfflineMedia({ media, onBack }) {
  const [isMagnified, setIsMagnified] = useState(false);
  const surfaceKey = `students-book:media:${media?.logicalKey || "unavailable"}`;
  return (
    <main className="teacher-offline-media has-classroom-tools">
      <header>
        <button type="button" onClick={onBack}><LegacyClassroomIcon name="back" /> Back to book</button>
        <div>
          <span className="teacher-offline-eyebrow">Local classroom media</span>
          <h1>{media?.label || "Book media"}</h1>
        </div>
      </header>
      <section className={isMagnified ? "classroom-magnified" : ""} data-classroom-surface-id={surfaceKey}>
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
      </section>
      <ClassroomToolbar surfaceKey={surfaceKey} onMagnify={() => setIsMagnified((value) => !value)} />
    </main>
  );
}

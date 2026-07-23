import { ArrowLeft } from "lucide-react";

import { StudentsBookMediaPlayer } from "../../components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx";

export default function TeacherOfflineMedia({ media, onBack }) {
  return (
    <main className="teacher-offline-media">
      <header>
        <button type="button" onClick={onBack}><ArrowLeft size={22} /> Back to book</button>
        <div>
          <span className="teacher-offline-eyebrow">Local classroom media</span>
          <h1>{media?.label || "Book media"}</h1>
        </div>
      </header>
      <section>
        {media?.logicalKey ? (
          <StudentsBookMediaPlayer
            logicalKey={media.logicalKey}
            type={media.type}
            className="teacher-offline-standalone-media"
          />
        ) : (
          <div className="teacher-offline-asset-error">This optional media item is unavailable.</div>
        )}
      </section>
    </main>
  );
}

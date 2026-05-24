import { useEffect } from "react";
import { MonitorPlay, X } from "lucide-react";
import { StudentCourseView } from "../student/StudentCourseView.jsx";
import { useSoundEffects } from "../../../context/SoundContext.jsx";

export function ActivityPreviewPanel({ course, activity, onClose }) {
  const { playSound } = useSoundEffects();

  useEffect(() => {
    playSound("modalOpen");
  }, [playSound]);

  const handleClose = () => {
    playSound("modalClose");
    onClose();
  };

  const previewCourse = {
    ...course,
    lesson: {
      ...course.lesson,
      activities: activity ? [activity] : [],
    },
  };

  return (
    <div className="activity-preview-modal-backdrop" role="presentation" onMouseDown={handleClose}>
      <section
        className="activity-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Preview as student"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="activity-preview-modal-head">
          <div className="editor-section-heading">
            <MonitorPlay size={19} />
            <div>
              <strong>Preview as student</strong>
              <span>This preview shows only the selected activity.</span>
            </div>
          </div>
          <button type="button" data-sound-ignore="true" className="modal-close-button" aria-label="Close student preview" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>
        <div className="embedded-student-preview compact-preview">
          <StudentCourseView course={previewCourse} previewMode />
        </div>
      </section>
    </div>
  );
}

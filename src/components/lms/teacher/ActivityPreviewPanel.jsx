import { useEffect } from "react";
import { MonitorPlay, X } from "lucide-react";
import { StudentCourseView } from "../student/StudentCourseView.jsx";
import { useSoundEffects } from "../../../context/SoundContext.jsx";

export function ActivityPreviewPanel({ course, activity, mode = "activity", onClose }) {
  const { playSound } = useSoundEffects();

  useEffect(() => {
    playSound("modalOpen");
  }, [playSound]);

  const handleClose = () => {
    playSound("modalClose");
    onClose();
  };

  const isActivityPreview = mode === "activity";
  const previewCourse = isActivityPreview ? {
    ...course,
    lesson: {
      ...course.lesson,
      activities: activity ? [activity] : [],
    },
  } : course;
  const title = isActivityPreview ? "Activity Preview" : "Whole Course Preview";
  const subtitle = isActivityPreview
    ? activity?.title || "Selected activity"
    : `${course.title} / ${course.lesson.title}`;

  return (
    <div className="activity-preview-modal-backdrop" role="presentation" onMouseDown={handleClose}>
      <section
        className="activity-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="activity-preview-modal-head">
          <div className="editor-section-heading">
            <MonitorPlay size={19} />
            <div>
              <strong>{title}</strong>
              <span>{subtitle}</span>
            </div>
          </div>
          <button type="button" data-sound-ignore="true" className="modal-close-button" aria-label="Close student preview" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>
        <div className={`embedded-student-preview compact-preview ${isActivityPreview ? "activity-preview-only" : "course-preview-full"}`}>
          <StudentCourseView course={previewCourse} previewMode />
        </div>
      </section>
    </div>
  );
}

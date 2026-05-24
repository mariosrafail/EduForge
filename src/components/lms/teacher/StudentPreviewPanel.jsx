import { MonitorPlay } from "lucide-react";
import { StudentCourseView } from "../student/StudentCourseView.jsx";

export function StudentPreviewPanel({ course }) {
  return (
    <section className="student-preview-panel">
      <div className="editor-section-heading">
        <MonitorPlay size={19} />
        <div>
          <strong>Student preview</strong>
          <span>Shows the current lesson exactly as a learner sees it.</span>
        </div>
      </div>
      <div className="embedded-student-preview">
        <StudentCourseView course={course} previewMode />
      </div>
    </section>
  );
}

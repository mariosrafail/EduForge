import { Eye } from "lucide-react";
import { SectionTitle } from "../Shared.jsx";
import { ActivityFlow } from "./ActivityFlow.jsx";
import { LessonBreadcrumbs } from "./LessonBreadcrumbs.jsx";
import { LessonSidebar } from "./LessonSidebar.jsx";

export function StudentCourseView({ course, onSubmission, navigateTo, previewMode = false, courseLoading = false, courseError = "", submitLesson }) {
  return (
    <div className="workspace course-workspace">
      {courseError && <div className="inline-status warning">{courseError}</div>}
      {courseLoading && <div className="inline-status">Loading course content...</div>}
      <LessonBreadcrumbs course={course} lesson={course.lesson} />
      <SectionTitle
        eyebrow={previewMode ? "Student preview" : "Student digital course"}
        title={course.lesson.title}
        text={`${course.title} / ${course.lesson.unit}. Complete the activities, submit your answers, and review targeted feedback.`}
        action={navigateTo && (
          <button className="secondary-action" onClick={() => navigateTo("teacher-course-editor")}>
            <Eye size={17} /> Teacher editor
          </button>
        )}
      />

      <div className="course-lesson-layout">
        <LessonSidebar
          course={course}
          lesson={course.lesson}
        />
        <ActivityFlow course={course} onSubmission={onSubmission} submitLesson={submitLesson} previewMode={previewMode} />
      </div>
    </div>
  );
}

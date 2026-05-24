import { ChevronRight, Home } from "lucide-react";

export function LessonBreadcrumbs({ course, lesson }) {
  return (
    <nav className="lesson-breadcrumbs" aria-label="Lesson breadcrumb">
      <span><Home size={15} /> Hamilton House ELT Demo</span>
      <ChevronRight size={15} />
      <span>{course.title}</span>
      <ChevronRight size={15} />
      <strong>{lesson.title}</strong>
    </nav>
  );
}

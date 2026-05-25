import { BookOpenCheck, Clock3, Layers3 } from "lucide-react";
import { Tag } from "../Shared.jsx";

export function LessonSidebar({ course, lesson, activeIndex = 0, onSelectActivity }) {
  return (
    <aside className="lesson-sidebar">
      <div className="lesson-book-card">
        <span><Layers3 size={18} /></span>
        <div>
          <strong>{course.title}</strong>
          <small>{course.level} digital course book</small>
        </div>
      </div>

      <div className="lesson-progress-card">
        <div>
          <span className="eyebrow"><Clock3 size={14} /> Lesson format</span>
          <b>{lesson.activities.length}</b>
        </div>
        <small>Use the list to jump between activities at any time.</small>
      </div>

      <div className="lesson-nav-list">
        <strong>Activity sequence</strong>
        {lesson.activities.map((activity, index) => (
          <button
            key={activity.id}
            type="button"
            className={activeIndex === index ? "selected" : ""}
            data-sound-click="nextActivity"
            onClick={() => onSelectActivity?.(index)}
            aria-current={activeIndex === index ? "true" : undefined}
          >
            <span>{index + 1}</span>
            <div>
              <b>{activity.title}</b>
              <small>{activity.skill || activity.instruction}</small>
            </div>
          </button>
        ))}
      </div>

      <div className="lesson-sidebar-note">
        <BookOpenCheck size={18} />
        <span>Digital book page style with interactive ELT practice.</span>
      </div>
      <Tag tone={lesson.status === "Assigned" ? "gold" : "blue"}>{lesson.status}</Tag>
    </aside>
  );
}

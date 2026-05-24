import { BookOpenCheck, Clock3, Layers3, LockKeyhole } from "lucide-react";
import { Tag } from "../Shared.jsx";

export function LessonSidebar({ course, lesson }) {
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
        <small>One activity appears at a time. Feedback unlocks the next step.</small>
      </div>

      <div className="lesson-nav-list">
        <strong>Activity sequence</strong>
        {lesson.activities.map((activity, index) => (
          <div key={activity.id} className="locked-activity-row">
            <span>{index + 1}</span>
            <div>
              <b>{activity.title}</b>
              <small>{activity.skill || activity.instruction}</small>
            </div>
            {index > 0 && <LockKeyhole size={15} />}
          </div>
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

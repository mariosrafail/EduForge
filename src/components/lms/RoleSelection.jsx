import { motion } from "framer-motion";
import { ArrowRight, BookOpenCheck, Building2, GraduationCap, KeyRound, Layers3, MonitorCheck, UserRound } from "lucide-react";
import { Card, Tag } from "./Shared.jsx";

const roleCards = [
  {
    id: "admin",
    icon: Building2,
    title: "School / Admin",
    text: "Configure branded school rollout, manage users, generate book code activation, and supervise ELT adoption.",
    stats: "School rollout, classes, roles, books",
  },
  {
    id: "teacher",
    icon: GraduationCap,
    title: "Teacher",
    text: "Open the course editor, adjust lesson content and activities, preview as a student, then assign the lesson.",
    stats: "Lesson editor, activity authoring, preview",
  },
  {
    id: "student",
    icon: UserRound,
    title: "Student",
    text: "Enter English Skills B1, open Welcome 2 - Vocabulary 4, complete activities, and receive feedback.",
    stats: "Digital book lesson, word bank, matching",
  },
];

export function RoleSelection({ navigateTo, brand }) {
  return (
    <main className="role-screen">
      <section className="landing-hero">
        <div className="hero-copy">
          <Tag tone="gold">Hamilton House platform demo</Tag>
          <h1>Hamilton House Publishers LMS for digital ELT course lessons.</h1>
          <p>
            A focused demo of a student-facing digital book lesson and a teacher-facing course editor for Hamilton House ELT content.
          </p>
          <div className="landing-actions">
            <button className="primary-action" onClick={() => navigateTo("student-course")}>
              <BookOpenCheck size={18} /> Open Student Lesson
            </button>
            <button className="secondary-action" onClick={() => navigateTo("teacher-course-editor")}>
              <MonitorCheck size={18} /> Open Teacher Editor
            </button>
            <button className="secondary-action" onClick={() => navigateTo("flow")}>
              <Layers3 size={18} /> View Flow
            </button>
          </div>
          <div className="demo-login-note"><KeyRound size={16} /> Demo mode, no real login required.</div>
        </div>

        <motion.div
          className="course-hero-preview"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <div className="preview-book-top">
            <span className="school-logo" style={{ background: brand.primary }}>{brand.logo}</span>
            <div>
              <strong>{brand.schoolName}</strong>
              <small>English Skills B1</small>
            </div>
          </div>
          <div className="preview-book-page">
            <span className="eyebrow">Welcome 2 - Vocabulary 4</span>
            <h2>Drag each word into the correct gap.</h2>
            <div className="preview-word-row">
              <span>Monday</span><span>Wednesday</span><span>Friday</span><span>Sunday</span>
            </div>
            <div className="preview-line"><b>1</b><span>We have English on _____ morning.</span></div>
            <div className="preview-line active"><b>2</b><span>When are the seasons in the UK?</span></div>
            <button className="primary-action">Submit answers</button>
          </div>
        </motion.div>
      </section>

      <section className="role-card-grid" aria-label="Role entry points">
        <div className="demo-entry-heading">
          <span className="eyebrow"><KeyRound size={15} /> Demo login</span>
          <h2>Choose a role to enter the platform</h2>
        </div>
        {roleCards.map((role, index) => {
          const Icon = role.icon;
          return (
            <motion.button
              key={role.id}
              className="role-entry"
              onClick={() => navigateTo(role.id === "teacher" ? "teacher-course-editor" : role.id === "student" ? "student-course" : `auth-${role.id}`)}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.07 + 0.12 }}
            >
              <Icon size={26} />
              <h2>{role.title}</h2>
              <p>{role.text}</p>
              <small>{role.stats}</small>
              <span><ArrowRight size={18} /></span>
            </motion.button>
          );
        })}
      </section>

      <Card className="publisher-strip">
        <div>
          <span className="eyebrow">Platform scope</span>
          <h2>Focused on the course experience</h2>
        </div>
        <p>
          The main route now follows a realistic ELT lesson: a student completes interactive book activities, while a teacher edits,
          previews, assigns, and reviews the same lesson content.
        </p>
      </Card>
    </main>
  );
}

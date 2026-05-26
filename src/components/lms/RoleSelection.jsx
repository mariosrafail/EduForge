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
          <div className="hero-value-list" aria-label="Platform highlights">
            <span><BookOpenCheck size={17} /> Digital book lesson flow</span>
            <span><MonitorCheck size={17} /> Teacher editor with live preview</span>
            <span><Layers3 size={17} /> Neon-backed activity content</span>
          </div>
        </div>

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
{/* 
      <Card className="publisher-strip">
        <div>
          <span className="eyebrow">Platform scope</span>
          <h2>Focused on the course experience</h2>
        </div>
        <p>
          The main route now follows a realistic ELT lesson: a student completes interactive book activities, while a teacher edits,
          previews, assigns, and reviews the same lesson content.
        </p>
      </Card> */}
    </main>
  );
}

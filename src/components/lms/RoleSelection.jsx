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
    <main className="role-screen role-selection-screen">
      <section className="landing-hero">
        <div className="hero-copy">
          <Tag tone="gold">Hamilton House platform demo</Tag>
          <h1>Hamilton House Publishers LMS for digital ELT course lessons.</h1>
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
              onClick={() => navigateTo(role.id === "teacher" ? "teacher-course-editor" : role.id === "student" ? "student-course" : "admin")}
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
    </main>
  );
}

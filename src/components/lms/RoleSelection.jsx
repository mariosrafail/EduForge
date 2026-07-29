import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Building2, GraduationCap, KeyRound, UserRound } from "lucide-react";
import { Card, Tag } from "./Shared.jsx";

const roleCards = [
  {
    id: "admin",
    icon: Building2,
    title: "School Admin",
    text: "Manage the Hamilton House ELT Demo profile, Ultimate B2 users, book activation codes, and class progress.",
    stats: "School profile, classes, roles, books",
  },
  {
    id: "teacher",
    icon: GraduationCap,
    title: "Teacher",
    text: "Open Ultimate B2 book content, adjust activities, preview as a student, then assign the lesson.",
    stats: "Digital book editor, activity authoring, preview",
  },
  {
    id: "student",
    icon: UserRound,
    title: "Student",
    text: "Enter the Ultimate B2 package, open Unit 2, complete assigned book exercises, and receive feedback.",
    stats: "Digital book access, Unit 2, feedback",
  },
];

export function RoleSelection({ navigateTo, brand }) {
  const reduceMotion = useReducedMotion();
  return (
    <main className="role-screen role-selection-screen">
      <section className="landing-hero">
        <div className="hero-copy">
          <Tag tone="gold">EduForge learning platform</Tag>
          <h1>One welcoming place for your school community.</h1>
          <p>Choose your role to sign in to the learning, teaching, or school administration workspace.</p>
        </div>
        <div className="landing-brand-mark" aria-hidden="true">
          <span>EF</span>
          <strong>{brand?.schoolName || "EduForge"}</strong>
          <small>Learn · Teach · Grow</small>
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
              onClick={() => navigateTo(role.id === "teacher" ? "teacher" : role.id === "student" ? "student" : "admin")}
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : index * 0.07 + 0.12 }}
            >
              <span className="role-entry-icon"><Icon size={27} /></span>
              <h2>{role.title}</h2>
              <p>{role.text}</p>
              <small>{role.stats}</small>
              <span className="role-entry-arrow"><ArrowRight size={18} /></span>
            </motion.button>
          );
        })}
      </section>
    </main>
  );
}

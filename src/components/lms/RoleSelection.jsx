import { motion } from "framer-motion";
import { ArrowRight, Building2, GraduationCap, Layers3, MonitorCheck, UserRound } from "lucide-react";
import { Card, Tag } from "./Shared.jsx";

const roleCards = [
  {
    id: "admin",
    icon: Building2,
    title: "School / Admin",
    text: "Configure branded school portals, manage users, assign books, and supervise institutional rollout.",
    stats: "Setup wizard, classes, roles, books",
  },
  {
    id: "teacher",
    icon: GraduationCap,
    title: "Teacher",
    text: "Assign activities, review submissions, analyze mistakes, export performance, and create custom exercises.",
    stats: "Skill analytics, marking, exports",
  },
  {
    id: "student",
    icon: UserRound,
    title: "Student",
    text: "Complete exercises inside a branded portal, receive correction feedback, and follow targeted revision paths.",
    stats: "Book units, attempts, practice",
  },
];

export function RoleSelection({ setView, brand }) {
  return (
    <main className="role-screen">
      <section className="landing-hero">
        <div className="hero-copy">
          <Tag tone="gold">Proprietary LMS platform demo</Tag>
          <h1>EduForge LMS for publishers, schools, teachers, and learners.</h1>
          <p>
            A polished front-end demo showing how a publisher can deliver branded school portals,
            digital books, teacher supervision, automated correction, learning analytics, and data exports.
          </p>
          <div className="landing-actions">
            <button className="primary-action" onClick={() => setView("flow")}>
              <Layers3 size={18} /> View Full Demo Flow
            </button>
            <button className="secondary-action" onClick={() => setView("admin")}>
              <MonitorCheck size={18} /> Start with school setup
            </button>
          </div>
        </div>

        <motion.div
          className="product-composition"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <div className="screen admin-screen">
            <span>{brand.schoolName}</span>
            <strong>78%</strong>
            <small>school completion</small>
          </div>
          <div className="screen teacher-screen">
            <span>Teacher analytics</span>
            <div><i style={{ height: "70%" }} /><i style={{ height: "44%" }} /><i style={{ height: "84%" }} /><i style={{ height: "58%" }} /></div>
          </div>
          <div className="screen student-screen">
            <span>Unit 4 Reading Check</span>
            <strong>Revise grammar</strong>
            <small>solutions remain locked</small>
          </div>
        </motion.div>
      </section>

      <section className="role-card-grid" aria-label="Role entry points">
        {roleCards.map((role, index) => {
          const Icon = role.icon;
          return (
            <motion.button
              key={role.id}
              className="role-entry"
              onClick={() => setView(role.id)}
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
          <h2>More than a course creator</h2>
        </div>
        <p>
          The demo positions EduForge as a proprietary LMS layer: school administration, publisher-controlled books,
          teacher workflows, student-facing practice, automated correction, and branded portal delivery.
        </p>
      </Card>
    </main>
  );
}

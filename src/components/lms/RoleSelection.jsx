import { motion } from "framer-motion";
import { ArrowRight, Building2, GraduationCap, KeyRound, Layers3, MonitorCheck, UserRound } from "lucide-react";
import hamiltonHouseLogo from "../../assets/branding/hamilton-house-logo.png";
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
    text: "Assign book-based practice, review submissions, run skill gap analysis, and author interactive activities.",
    stats: "Teacher adoption dashboard, marking, exports",
  },
  {
    id: "student",
    icon: UserRound,
    title: "Student",
    text: "Activate a book code, complete book-based practice, receive correction feedback, and follow revision paths.",
    stats: "Book units, attempts, skill practice",
  },
];

export function RoleSelection({ navigateTo, brand }) {
  return (
    <main className="role-screen">
      <section className="landing-hero">
        <div className="hero-copy">
          <Tag tone="gold">Hamilton House platform demo</Tag>
          <h1>Hamilton House Publishers LMS for schools, teachers, and learners.</h1>
          <p>
            A polished front-end demo showing how Hamilton House can deliver branded school portals,
            book-based practice, book code activation, teacher adoption dashboards, skill gap analysis, and publisher intelligence.
          </p>
          <div className="landing-actions">
            <button className="primary-action" onClick={() => navigateTo("flow")}>
              <Layers3 size={18} /> View Full Demo Flow
            </button>
            <button className="secondary-action" onClick={() => navigateTo("auth-admin")}>
              <MonitorCheck size={18} /> Enter as School / Admin
            </button>
          </div>
          <div className="demo-login-note"><KeyRound size={16} /> Demo mode, no real login required.</div>
        </div>

        <motion.div
          className="product-composition"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <div className="screen logo-screen">
            <img src={hamiltonHouseLogo} alt="Hamilton House Publishers LMS logo" />
            <small>ELT publisher LMS</small>
          </div>
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
              onClick={() => navigateTo(`auth-${role.id}`)}
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
          The demo positions Hamilton House Publishers LMS as a proprietary ELT LMS layer: school rollout, publisher-controlled books,
          interactive activity authoring, student-facing practice, automated correction, and branded portal delivery.
        </p>
      </Card>
    </main>
  );
}

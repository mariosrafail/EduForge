import { ArrowRight, BookOpen, Building2, GraduationCap, UserRound } from "lucide-react";
import { Card, SectionTitle, Tag } from "./Shared.jsx";

const flow = [
  {
    icon: Building2,
    title: "1. School setup",
    text: "Admin configures school profile, brand colors, users, classes, and assigns a virtual English book.",
  },
  {
    icon: GraduationCap,
    title: "2. Teacher supervision",
    text: "Teacher selects a class, assigns reading, listening, grammar, vocabulary, and writing work, then reviews submissions.",
  },
  {
    icon: UserRound,
    title: "3. Student learning",
    text: "Student completes exercises, sees correction feedback, receives revision guidance, and requests another attempt.",
  },
  {
    icon: BookOpen,
    title: "4. Publisher value",
    text: "School data, book usage, skill gaps, and exportable performance reports prove the platform value.",
  },
];

export function FullDemoFlow({ setView }) {
  return (
    <div className="workspace">
      <SectionTitle
        eyebrow="End-to-end demo flow"
        title="A complete LMS story for publisher sales conversations."
        text="Use this overview to present EduForge as the operational layer connecting publishers, schools, teachers, and students."
      />

      <section className="flow-grid">
        {flow.map((item, index) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} className="flow-card">
              <Icon size={26} />
              <h2>{item.title}</h2>
              <p>{item.text}</p>
              {index < flow.length - 1 && <ArrowRight className="flow-arrow" size={22} />}
            </Card>
          );
        })}
      </section>

      <Card className="demo-script">
        <div>
          <Tag tone="gold">Suggested demo route</Tag>
          <h2>Start with Admin, switch to Teacher, finish with Student correction.</h2>
          <p>
            The role switcher remains visible so a client can understand each user experience without authentication.
            All data is mocked locally, but the surface area mirrors a real proprietary LMS: branding, enrolment,
            book assignment, teacher workflows, automated correction, analytics, and export.
          </p>
        </div>
        <div className="flow-actions">
          <button className="primary-action" onClick={() => setView("admin")}>Open Admin</button>
          <button className="secondary-action" onClick={() => setView("teacher")}>Open Teacher</button>
          <button className="secondary-action" onClick={() => setView("student")}>Open Student</button>
        </div>
      </Card>
    </div>
  );
}

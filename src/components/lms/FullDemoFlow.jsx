import { ArrowRight, BarChart3, BookCheck, Building2, CheckCircle2, GraduationCap, KeyRound, UserRound } from "lucide-react";
import { useState } from "react";
import { publisherIntelligence } from "../../data/lmsDemoData.js";
import { Card, SectionTitle, Tag } from "./Shared.jsx";

const flow = [
  {
    icon: Building2,
    title: "School setup",
    text: "Admin configures school profile, brand colors, users, classes, and first enrolment rules.",
    target: "admin",
  },
  {
    icon: KeyRound,
    title: "Book activation",
    text: "Activated book codes unlock the correct digital book, units, exercise banks, and reporting tags.",
    target: "admin",
  },
  {
    icon: GraduationCap,
    title: "Teacher assignment",
    text: "Teacher chooses a class, publishes work from a book unit, and controls attempts and due dates.",
    target: "teacher",
  },
  {
    icon: UserRound,
    title: "Student exercise",
    text: "Student completes a branded full test with reading, listening, grammar, vocabulary, and writing sections.",
    target: "student",
  },
  {
    icon: CheckCircle2,
    title: "Automatic correction",
    text: "The LMS returns mistakes and revision guidance while keeping the correct answers locked.",
    target: "student",
  },
  {
    icon: BarChart3,
    title: "Analytics/export",
    text: "Admins and publishers review adoption, difficult skills, book engagement, and exportable evidence.",
    target: "admin",
  },
];

export function FullDemoFlow({ setView }) {
  const [activeStep, setActiveStep] = useState(0);
  const [exported, setExported] = useState(false);
  const active = flow[activeStep];
  const ActiveIcon = active.icon;

  return (
    <div className="workspace">
      <SectionTitle
        eyebrow="End-to-end demo flow"
        title="A complete LMS story for publisher sales conversations."
        text="Use this overview to present EduForge as the operational layer connecting publishers, schools, teachers, and students."
      />

      <Card className="presentation-mode priority-panel">
        <div className="presentation-stage">
          <div className="step-number">{activeStep + 1}</div>
          <div>
            <span className="eyebrow"><ActiveIcon size={15} /> Guided presentation mode</span>
            <h2>{active.title}</h2>
            <p>{active.text}</p>
          </div>
        </div>
        <div className="flow-actions">
          <button className="primary-action" onClick={() => setView(active.target)}>Jump to {active.target === "admin" ? "Admin" : active.target === "teacher" ? "Teacher" : "Student"}</button>
          <button className="secondary-action" onClick={() => setActiveStep((activeStep + 1) % flow.length)}>Next step</button>
        </div>
      </Card>

      <section className="flow-grid guided-flow-grid">
        {flow.map((item, index) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} className={`flow-card ${activeStep === index ? "selected" : ""}`}>
              <button className="flow-step-button" onClick={() => setActiveStep(index)}>Step {index + 1}</button>
              <Icon size={26} />
              <h2>{index + 1}. {item.title}</h2>
              <p>{item.text}</p>
              <button className="secondary-action compact-action" onClick={() => setView(item.target)}>Open role</button>
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

      <Card className="publisher-intelligence">
        <div className="card-heading">
          <div>
            <span className="eyebrow"><BookCheck size={15} /> Publisher intelligence</span>
            <h2>What the publisher or owner can prove</h2>
            <p>Book-code activation, unit usage, difficult skills, engagement, and adoption exports turn LMS usage into sales and renewal evidence.</p>
          </div>
          <button className="secondary-action" onClick={() => setExported(true)}>Export adoption snapshot</button>
        </div>
        {exported && <div className="inline-status success">Snapshot export prepared for publisher review.</div>}
        <div className="publisher-metric-grid">
          {publisherIntelligence.map((item) => (
            <article key={item.label}>
              <span style={{ background: item.accent }} />
              <small>{item.label}</small>
              <strong>{item.value}</strong>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}

import { UserRound } from "lucide-react";
import { studentDashboardCards } from "../studentPortalData.js";
import { Card, SectionTitle, Tag } from "../../Shared.jsx";
import {
  studentCardMetric,
  studentProfilePresentation,
} from "../../shared/portalDashboardPresentation.js";
import { sectionIcons } from "./studentPortalConfig.js";

export function StudentProfileStrip({ currentUser = null, metricsState = { loading: true, error: "", data: null } }) {
  const profile = studentProfilePresentation(metricsState);
  return (
    <Card className="student-profile-strip">
      <div>
        <span><UserRound size={19} /></span>
        <div>
          <strong>{currentUser?.full_name || "Student"} (Student)</strong>
          <small>{profile.detail}</small>
        </div>
      </div>
      <Tag tone="green">{profile.tag}</Tag>
    </Card>
  );
}

export function StudentDashboard({ goToSection, currentUser = null, metricsState = { loading: true, error: "", data: null } }) {
  const firstName = currentUser?.full_name?.split(" ")?.[0] || "there";
  return (
    <>
      <SectionTitle
        eyebrow="Student portal"
        title={`Welcome back, ${firstName}.`}
        text="Open your activated books, complete assigned exercises, and review corrected work from your teacher."
      />
      <StudentProfileStrip currentUser={currentUser} metricsState={metricsState} />
      {metricsState.error && (
        <div className="inline-status warning">
          Live dashboard metrics and profile details are unavailable. You can still use the student tools below.
        </div>
      )}
      <section className="student-dashboard-grid" aria-label="Student dashboard sections">
        {studentDashboardCards.map((card) => {
          const Icon = sectionIcons[card.id];
          return (
            <button
              key={card.id}
              type="button"
              className="student-dashboard-card"
              onClick={() => goToSection(card.id)}
              data-sound-click="submit"
            >
              <span><Icon size={25} /></span>
              <strong>{card.title}</strong>
              <p>{card.description}</p>
              <small>{studentCardMetric(card.id, metricsState)}</small>
            </button>
          );
        })}
      </section>
    </>
  );
}

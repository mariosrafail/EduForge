import { BarChart3, BookOpen, Download, Link2 } from "lucide-react";
import { exerciseTypes, integrationOptions, publisherIntelligence } from "../../../../data/lmsDemoData.js";
import { Card, Progress, Tag } from "../../Shared.jsx";
import { AdminInviteLink } from "../AdminInviteLink.jsx";
import { AdminLicensingPanel } from "../AdminLicensingPanel.jsx";

export function AdminBooksClassesSection({ classes, error }) {
  return (
    <section className="admin-section-panel">
      <Card>
        <div className="card-heading">
          <div><span className="eyebrow"><BookOpen size={15} /> School classes</span><h2>Live class-to-book access</h2><p>Classes, teachers, student counts, and assignment completion are scoped to this school.</p></div>
          <Tag tone="green">Database-backed</Tag>
        </div>
        {error && <div className="inline-status error">{error}</div>}
        {!error && !classes.length && <div className="inline-status">No classes are configured for this school.</div>}
        <div className="class-list">
          {classes.map((item) => (
            <article key={item.name}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.teacher} / {item.students} students / {item.assignedBook}</span>
                <AdminInviteLink classItem={item} />
              </div>
              <Progress value={item.completion} color="linear-gradient(90deg, var(--brand-primary), var(--brand-secondary))" />
            </article>
          ))}
        </div>
        <div className="exercise-type-row">{exerciseTypes.slice(0, 4).map((type) => <Tag key={type} tone="violet">{type}</Tag>)}</div>
      </Card>
      <AdminLicensingPanel />
    </section>
  );
}

export function AdminPublisherIntelligenceSection({ exported, onExport }) {
  return (
    <section className="admin-section-panel">
      <Card className="publisher-intelligence priority-panel">
        <div className="card-heading">
          <div>
            <span className="eyebrow"><BarChart3 size={15} /> Publisher intelligence</span>
            <h2>Adoption evidence for publishing teams</h2>
            <p>Review book activation, adoption, skill gaps, and engagement without exposing individual answers.</p>
          </div>
          <button className="secondary-action" type="button" onClick={onExport}><Download size={17} /> Export adoption data</button>
        </div>
        {exported && <div className="inline-status success">Adoption export prepared with school, book code, unit usage, skill difficulty, and engagement columns.</div>}
        <div className="publisher-metric-grid">
          {publisherIntelligence.map((item) => (
            <article key={item.label}><span style={{ background: item.accent }} /><small>{item.label}</small><strong>{item.value}</strong><p>{item.note}</p></article>
          ))}
        </div>
      </Card>
    </section>
  );
}

export function AdminIntegrationsSection({ selectedIntegration, onSelect }) {
  return (
    <section className="admin-section-panel">
      <Card className="integration-panel">
        <div className="card-heading">
          <div>
            <span className="eyebrow"><Link2 size={15} /> Integration-ready architecture</span>
            <h2>Standalone now, connected later</h2>
            <p>EduForge can connect to existing school systems in later phases.</p>
          </div>
          {selectedIntegration && <Tag tone="blue">{selectedIntegration} selected</Tag>}
        </div>
        <div className="integration-grid">
          {integrationOptions.map((option) => (
            <button key={option} className={selectedIntegration === option ? "selected" : ""} onClick={() => onSelect(option)}>
              <span>{option}</span>
              <small>{selectedIntegration === option ? "Demo connection highlighted" : "Integration-ready"}</small>
            </button>
          ))}
        </div>
      </Card>
    </section>
  );
}

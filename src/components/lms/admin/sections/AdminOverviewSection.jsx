import { BookOpen, Building2, CheckCircle2, Plus, Users } from "lucide-react";
import { rolloutActions, schoolMetrics } from "../../../../data/lmsDemoData.js";
import { Card, MetricCard, SectionTitle, Tag } from "../../Shared.jsx";

export function AdminOverviewSection({ completedRollout, onToggleRollout, onOpenLicensing }) {
  return (
    <section className="admin-section-panel">
      <SectionTitle
        eyebrow="School administration"
        title="Launch school rollout and publisher-controlled book access."
        text="Configure school identity, create users, activate books, organize classes, and review adoption for this school."
      />
      <section className="metric-grid">
        {schoolMetrics.map(([label, value, note], index) => (
          <MetricCard key={label} label={label} value={value} note={note} icon={index === 3 ? BookOpen : index === 1 ? Users : Building2} delay={index} />
        ))}
      </section>
      <div className="inline-status">Overview cards are a demo preview. Users and Books &amp; classes licensing panels load live school-scoped database data.</div>
      <Card className="rollout-actions priority-panel">
        <div className="card-heading">
          <div>
            <span className="eyebrow"><CheckCircle2 size={15} /> School rollout actions</span>
            <h2>Publisher-ready launch checklist</h2>
            <p>Follow the path from school setup to book activation and teacher adoption.</p>
          </div>
          <Tag tone="green">{completedRollout.length}/{rolloutActions.length} completed</Tag>
        </div>
        <div className="rollout-action-grid">
          {rolloutActions.map((action) => {
            const isCompleted = completedRollout.includes(action);
            const isCodeAction = action === "Generate book activation codes";
            return (
              <button
                key={action}
                className={`${isCompleted ? "completed" : ""} ${isCodeAction ? "code-action" : ""}`}
                onClick={() => isCodeAction ? onOpenLicensing() : onToggleRollout(action)}
              >
                <span>{isCompleted ? <CheckCircle2 size={17} /> : <Plus size={17} />}</span>
                <strong>{action}</strong>
                <small>{isCodeAction ? "Open live licensing" : isCompleted ? "Ready" : "Run demo action"}</small>
              </button>
            );
          })}
        </div>
      </Card>
    </section>
  );
}
